const { withAndroidManifest, withMainApplication, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const PACKAGE_PATH = "com/yourcompany/salestracker";
const SRC_FILES = [
  "AlarmReceiver.kt",
  "AlarmRingService.kt",
  "AlarmActivity.kt",
  "SalesAlarmModule.kt",
  "SalesAlarmPackage.kt",
];

// ponytail: copies fixed native source into the generated android/ project on every
// prebuild, instead of hand-merging files after each `expo prebuild --clean`.
function withAlarmNativeFiles(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const destDir = path.join(
        config.modRequest.platformProjectRoot,
        "app/src/main/java",
        PACKAGE_PATH
      );
      fs.mkdirSync(destDir, { recursive: true });
      for (const file of SRC_FILES) {
        fs.copyFileSync(
          path.join(__dirname, "android-alarm-src", file),
          path.join(destDir, file)
        );
      }
      return config;
    },
  ]);
}

function withAlarmManifest(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];

    if (!app.receiver) app.receiver = [];
    app.receiver.push({
      $: {
        "android:name": ".AlarmReceiver",
        "android:exported": "true",
        "android:enabled": "true",
      },
      "intent-filter": [
        {
          action: [
            { $: { "android:name": "com.yourcompany.salestracker.ALARM_TRIGGER" } },
            { $: { "android:name": "android.intent.action.BOOT_COMPLETED" } },
          ],
        },
      ],
    });

    if (!app.service) app.service = [];
    app.service.push({
      $: {
        "android:name": ".AlarmRingService",
        "android:exported": "false",
        "android:foregroundServiceType": "mediaPlayback",
      },
    });

    if (!app.activity) app.activity = [];
    app.activity.push({
      $: {
        "android:name": ".AlarmActivity",
        "android:exported": "false",
        "android:launchMode": "singleTask",
        "android:excludeFromRecents": "true",
      },
    });

    return config;
  });
}

function withAlarmMainApplication(config) {
  return withMainApplication(config, (config) => {
    if (!config.modResults.contents.includes("SalesAlarmPackage")) {
      config.modResults.contents = config.modResults.contents.replace(
        "PackageList(this).packages",
        "PackageList(this).packages.apply { add(SalesAlarmPackage()) }"
      );
    }
    return config;
  });
}

module.exports = function withAndroidAlarm(config) {
  config = withAlarmNativeFiles(config);
  config = withAlarmManifest(config);
  config = withAlarmMainApplication(config);
  return config;
};
