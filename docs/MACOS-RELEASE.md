# macOS release

Build an Apple Silicon application:

```sh
bun run package:desktop
```

The release uses the installed Developer ID Application certificate for team `5N66S29EK2`, hardened runtime, and `apps/electron/assets/app.icns`. Non-executable data resources are sealed by the containing bundle rather than signed independently.

Notarize and staple the app before making the DMG:

```sh
ditto -c -k --keepParent 'dist-desktop/mac-arm64/OpenCut AI.app' dist-desktop/OpenCut-AI-notary.zip
xcrun notarytool submit dist-desktop/OpenCut-AI-notary.zip --keychain-profile OpenCutAI --wait
xcrun stapler staple 'dist-desktop/mac-arm64/OpenCut AI.app'
bun x electron-builder --config apps/electron/builder.json --prepackaged 'dist-desktop/mac-arm64/OpenCut AI.app' --mac dmg --arm64
xcrun notarytool submit dist-desktop/OpenCut-AI-0.1.11-arm64.dmg --keychain-profile OpenCutAI --wait
xcrun stapler staple dist-desktop/OpenCut-AI-0.1.11-arm64.dmg
```

Store authorized notarization credentials in Keychain with `xcrun notarytool store-credentials OpenCutAI`; the command prompts securely. Builds reference that profile. Never commit credentials or put passwords in build configuration.

Final verification:

```sh
codesign --verify --deep --strict 'dist-desktop/mac-arm64/OpenCut AI.app'
xcrun stapler validate 'dist-desktop/mac-arm64/OpenCut AI.app'
xcrun stapler validate dist-desktop/OpenCut-AI-0.1.11-arm64.dmg
spctl --assess --type execute --verbose=2 'dist-desktop/mac-arm64/OpenCut AI.app'
spctl --assess --type open --context context:primary-signature --verbose=2 dist-desktop/OpenCut-AI-0.1.11-arm64.dmg
```

Screen recording and microphone require the user's macOS privacy permission after installation. The signed app starts its embedded local editor on port 3002; no Bun installation or separate terminal service is required.
