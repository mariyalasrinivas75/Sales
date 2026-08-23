import { Platform } from "react-native";

/**
 * JS bridge to expo-speech-recognition. requireNativeModule() throws synchronously
 * if the native module isn't linked (e.g. plain Expo Go), so the import must be
 * inside try/catch — a static `import` would crash the whole bundle on load.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
let SpeechRecognitionModule: typeof import("expo-speech-recognition").ExpoSpeechRecognitionModule | null = null;
try {
  if (Platform.OS === "android" || Platform.OS === "ios") {
    SpeechRecognitionModule = require("expo-speech-recognition").ExpoSpeechRecognitionModule;
  }
} catch {
  SpeechRecognitionModule = null;
}

/** Only available on Android/iOS with a dev-client or production build. */
export const isSTTAvailable = !!SpeechRecognitionModule;

/**
 * Listens for a single final speech result and resolves with the transcript.
 * Rejects on permission denial, recognizer error, or no speech detected.
 */
export function listenOnce(): Promise<string> {
  if (!SpeechRecognitionModule) {
    return Promise.reject(new Error("Speech recognition not available"));
  }
  const module = SpeechRecognitionModule;

  return module.requestPermissionsAsync().then((perm) => {
    if (!perm.granted) throw new Error("Microphone permission denied");

    return new Promise<string>((resolve, reject) => {
      let done = false;
      const finish = (fn: () => void) => {
        if (done) return;
        done = true;
        resultSub.remove();
        errorSub.remove();
        endSub.remove();
        fn();
      };

      const resultSub = module.addListener("result", (event) => {
        if (event.isFinal) {
          finish(() => resolve(event.results?.[0]?.transcript ?? ""));
        }
      });
      const errorSub = module.addListener("error", (event) => {
        finish(() => reject(new Error(event.message || event.error)));
      });
      const endSub = module.addListener("end", () => {
        finish(() => reject(new Error("no-speech")));
      });

      module.start({ lang: "en-IN", interimResults: false, continuous: false });
    });
  });
}

export function abortListening(): void {
  SpeechRecognitionModule?.abort();
}
