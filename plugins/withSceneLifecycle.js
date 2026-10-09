// The iOS 27 SDK asserts at launch unless the app adopts the UIScene life cycle.
// Expo SDK 57's prebuild template still creates the window in AppDelegate, so this
// plugin backports the SDK 58 template: a SceneDelegate built on ExpoAppSceneDelegate.
const fs = require('fs');
const path = require('path');
const {
  IOSConfig,
  withAppDelegate,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require('expo/config-plugins');

const SCENE_DELEGATE = `internal import Expo

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
`;

const withSceneManifest = (config) =>
  withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return c;
  });

const withSceneAppDelegate = (config) =>
  withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') {
      throw new Error('withSceneLifecycle expects a Swift AppDelegate');
    }
    let src = c.modResults.contents;
    if (!src.includes('ExpoReactNativeFactoryProvider')) {
      src = src.replace(
        'class AppDelegate: ExpoAppDelegate {',
        'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
      );
    }
    // SceneDelegate creates the window and starts React Native instead.
    src = src.replace(
      /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)[\s\S]*?#endif\n/,
      '',
    );
    if (!src.includes('ExpoReactNativeFactoryProvider') || src.includes('UIScreen.main.bounds')) {
      throw new Error('withSceneLifecycle could not patch AppDelegate.swift; the template changed');
    }
    c.modResults.contents = src;
    return c;
  });

const withSceneDelegateFile = (config) => {
  config = withDangerousMod(config, [
    'ios',
    (c) => {
      const name = IOSConfig.XcodeUtils.getProjectName(c.modRequest.projectRoot);
      fs.writeFileSync(path.join(c.modRequest.platformProjectRoot, name, 'SceneDelegate.swift'), SCENE_DELEGATE);
      return c;
    },
  ]);
  return withXcodeProject(config, (c) => {
    const name = IOSConfig.XcodeUtils.getProjectName(c.modRequest.projectRoot);
    const filepath = `${name}/SceneDelegate.swift`;
    if (!c.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName: name, project: c.modResults });
    }
    return c;
  });
};

module.exports = (config) => withSceneDelegateFile(withSceneAppDelegate(withSceneManifest(config)));
