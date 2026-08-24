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

const LISTEN_TIMEOUT_MS = 8000;

/**
 * Listens for a single final speech result and resolves with the transcript.
 * Rejects on permission denial, recognizer error, no speech detected, or timeout
 * (some Android OEM recognizers never fire "end" if the mic hangs — the hard
 * timeout is the safety net for that).
 *
 * onPartial, if given, is called with live interim transcript as the user speaks,
 * so the UI can show "hearing you" feedback instead of a dead "Listening..." label.
 */
export function listenOnce(onPartial?: (text: string) => void): Promise<string> {
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
        clearTimeout(timer);
        resultSub.remove();
        errorSub.remove();
        endSub.remove();
        fn();
      };

      const timer = setTimeout(() => {
        module.abort();
        finish(() => reject(new Error("timeout")));
      }, LISTEN_TIMEOUT_MS);

      const resultSub = module.addListener("result", (event) => {
        const transcript = event.results?.[0]?.transcript ?? "";
        if (event.isFinal) {
          finish(() => resolve(transcript));
        } else {
          onPartial?.(transcript);
        }
      });
      const errorSub = module.addListener("error", (event) => {
        finish(() => reject(new Error(event.message || event.error)));
      });
      const endSub = module.addListener("end", () => {
        finish(() => reject(new Error("no-speech")));
      });

      module.start({ lang: "en-IN", interimResults: true, continuous: false });
    });
  });
}

export function abortListening(): void {
  SpeechRecognitionModule?.abort();
}
