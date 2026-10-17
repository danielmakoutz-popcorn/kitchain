import { forwardRef } from "react";
import { Pressable, View, type PressableProps } from "react-native";
import { feedback, type Feedback } from "@/lib/haptics";

type Props = PressableProps & { haptic?: Feedback | false };

/** Also forwards its ref and handlers for Expo Router's Link asChild. */
export const HapticPressable = forwardRef<View, Props>(function HapticPressable(
  { haptic = "press", disabled, onPress, style, accessibilityState, ...props }, ref,
) {
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      ref={ref}
      disabled={disabled}
      accessibilityState={{ ...accessibilityState, disabled: !!disabled }}
      aria-checked={props["aria-checked"] ?? accessibilityState?.checked}
      aria-selected={props["aria-selected"] ?? accessibilityState?.selected}
      aria-expanded={props["aria-expanded"] ?? accessibilityState?.expanded}
      aria-busy={props["aria-busy"] ?? accessibilityState?.busy}
      aria-disabled={props["aria-disabled"] ?? !!disabled}
      style={(state) => [
        typeof style === "function" ? style(state) : style,
        (state.pressed || disabled) && { opacity: disabled ? 0.5 : 0.75 },
      ]}
      onPress={(event) => {
        if (disabled) return;
        if (haptic) feedback(haptic);
        onPress?.(event);
      }}
    />
  );
});
