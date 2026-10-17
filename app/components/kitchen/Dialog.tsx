import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Keyboard, Modal, ScrollView, View, type AlertButton } from "react-native";
import { kitchen as c, kitchenFonts } from "@/constants/kitchen";
import { ArtSlot } from "@/components/ArtSlot";
import { KitchenButton, KitchenText } from "./Controls";
import { Flourish, PixelFrame, PixelIcon } from "./PixelArt";

type DialogRequest = { title: string; message?: string; buttons: AlertButton[] };
type DialogApi = { alert: (title: string, message?: string, buttons?: AlertButton[]) => void };
const DialogContext = createContext<DialogApi | null>(null);

/** Keep confirmations and their original callbacks, with a shared themed surface. */
export function KitchenDialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const choosing = useRef(false);
  const alert = useCallback((title: string, message?: string, buttons?: AlertButton[]) => {
    Keyboard.dismiss();
    setQueue(prev => [...prev, { title, message, buttons: buttons?.length ? buttons : [{ text: "Done" }] }]);
  }, []);
  const value = useMemo(() => ({ alert }), [alert]);
  const current = queue[0];
  function choose(button: AlertButton) {
    if (choosing.current) return;
    choosing.current = true;
    setQueue(prev => prev.slice(1));
    // Release before invoking a callback: it may queue another dialog.
    queueMicrotask(() => { choosing.current = false; button.onPress?.(); });
  }
  const success = !!current && /saved|created|photo added|updated/i.test(current.title) && !current.title.includes("?");
  return <DialogContext.Provider value={value}>
    <View style={{ flex: 1 }} accessibilityElementsHidden={!!current}
      importantForAccessibility={current ? "no-hide-descendants" : "auto"}
      aria-hidden={!!current} pointerEvents={current ? "none" : "auto"}>{children}</View>
    <Modal visible={!!current} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {
      if (!current) return;
      const cancel = current.buttons.find(button => button.style === "cancel");
      if (cancel) choose(cancel);
      else if (current.buttons.length === 1) choose(current.buttons[0]);
    }}>
      {current && <View style={{ flex: 1, backgroundColor: "rgba(54,35,29,0.52)", justifyContent: "center", padding: 22 }}>
        <View accessibilityViewIsModal style={{ width: "100%", maxWidth: 440, alignSelf: "center", maxHeight: "85%" }}>
          <PixelFrame ornate style={{ flexShrink: 1 }} contentStyle={{ padding: 26, gap: 16, flexShrink: 1 }}>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
              <View style={{ alignItems: "center", gap: 10 }}>
                {success ? <ArtSlot name="saveSuccess" fallback={<View style={{ flexDirection: "row", gap: 18, alignItems: "center" }}><PixelIcon name="sparkle" color={c.border} size={18} /><PixelIcon name="check" color={c.greenInk} size={42} /><PixelIcon name="sparkle" color={c.border} size={18} /></View>} /> : <Flourish />}
                <KitchenText accessibilityRole="header" style={{ fontFamily: kitchenFonts.heading, fontSize: 24, lineHeight: 32, fontWeight: "700", textAlign: "center" }}>{current.title}</KitchenText>
              </View>
              {!!current.message && <KitchenText style={{ textAlign: "center" }}>{current.message}</KitchenText>}
              <View style={{ gap: 10, paddingTop: 6 }}>{current.buttons.map((button, index) => <KitchenButton key={index} onPress={() => choose(button)} variant={button.style === "destructive" ? "danger" : button.style === "cancel" ? "neutral" : "primary"}>{button.text || "Done"}</KitchenButton>)}</View>
            </ScrollView>
          </PixelFrame>
        </View>
      </View>}
    </Modal>
  </DialogContext.Provider>;
}
export function useKitchenDialog(): DialogApi {
  const value = useContext(DialogContext);
  if (!value) throw new Error("Kitchen dialogs must be inside KitchenDialogProvider");
  return value;
}
