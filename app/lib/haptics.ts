import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export type Feedback = "press" | "selection" | "success" | "warning" | "error";

/** Feedback must never delay or interrupt the action it accompanies. */
export function feedback(kind: Feedback = "press") {
  if (Platform.OS === "web") return;
  try {
    const effect = Platform.OS === "android"
      ? Haptics.performAndroidHapticsAsync(
          kind === "success" ? Haptics.AndroidHaptics.Confirm
            : kind === "error" || kind === "warning" ? Haptics.AndroidHaptics.Reject
              : kind === "selection" ? Haptics.AndroidHaptics.Segment_Tick
                : Haptics.AndroidHaptics.Virtual_Key,
        )
      : kind === "press" ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        : kind === "selection" ? Haptics.selectionAsync()
          : Haptics.notificationAsync(
              kind === "success" ? Haptics.NotificationFeedbackType.Success
                : kind === "warning" ? Haptics.NotificationFeedbackType.Warning
                  : Haptics.NotificationFeedbackType.Error,
            );
    void effect.catch(() => undefined);
  } catch {
    // Unsupported hardware or disabled system feedback should not break a button.
  }
}
