import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertDialog, Toast } from "radix-ui";
import { AnimatePresence, motion } from "motion/react";
import { Check, X } from "lucide-react";

type Confirmation = {
  title: string;
  description: string;
  action?: string;
  danger?: boolean;
};
const ConfirmContext = createContext<(options: Confirmation | string) => Promise<boolean>>(
  async () => false,
);
const ToastContext = createContext<(message: string) => void>(() => {});
export const useConfirm = () => useContext(ConfirmContext);
export const useToast = () => useContext(ToastContext);
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [viewport, setViewport] = useState<{ height: number; top: number }>();
  const hasConfirmation = !!confirmation;
  useEffect(() => {
    const visual = window.visualViewport;
    if (!hasConfirmation || !visual) return;
    const update = () => setViewport({ height: visual.height, top: visual.offsetTop });
    update();
    visual.addEventListener("resize", update);
    visual.addEventListener("scroll", update);
    return () => {
      visual.removeEventListener("resize", update);
      visual.removeEventListener("scroll", update);
    };
  }, [hasConfirmation]);
  const pending = useRef<((answer: boolean) => void) | null>(null);
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);
  const confirm = useCallback((options: Confirmation | string) => {
    if (pending.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
      setConfirmation(
        typeof options === "string"
          ? {
              title: options,
              description: "You can stay here to keep your changes.",
              action: "Continue",
            }
          : options,
      );
    });
  }, []);
  const answer = useCallback((value: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setConfirmation(null);
    resolve?.(value);
  }, []);
  useEffect(
    () => () => {
      pending.current?.(false);
    },
    [],
  );
  const noticeId = useRef(0);
  const toast = useCallback(
    (message: string) => setNotice({ id: ++noticeId.current, message }),
    [],
  );
  return (
    <ConfirmContext.Provider value={confirm}>
      <ToastContext.Provider value={toast}>
        <Toast.Provider duration={4500} swipeDirection="right">
          {children}
          <AlertDialog.Root
            open={!!confirmation}
            onOpenChange={(open) => {
              if (!open) answer(false);
            }}
          >
            <AlertDialog.Portal>
              <AlertDialog.Overlay
                className="confirmation-backdrop"
                style={
                  viewport
                    ? {
                        top: viewport.top,
                        height: viewport.height,
                        bottom: "auto",
                      }
                    : undefined
                }
              />
              <AlertDialog.Content
                className="confirmation-dialog"
                style={
                  viewport
                    ? {
                        top: viewport.top + viewport.height / 2,
                        maxHeight: viewport.height - 32,
                        overflowY: "auto",
                      }
                    : { maxHeight: "calc(100dvh - 32px)", overflowY: "auto" }
                }
              >
                <AlertDialog.Title>{confirmation?.title}</AlertDialog.Title>
                <AlertDialog.Description>{confirmation?.description}</AlertDialog.Description>
                <div className="button-row">
                  <AlertDialog.Cancel asChild>
                    <button className="button secondary" onClick={() => answer(false)}>
                      Cancel
                    </button>
                  </AlertDialog.Cancel>
                  <AlertDialog.Action asChild>
                    <button
                      className={`button ${confirmation?.danger ? "danger" : "primary"}`}
                      onClick={() => answer(true)}
                    >
                      {confirmation?.action || "Continue"}
                    </button>
                  </AlertDialog.Action>
                </div>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog.Root>
          <AnimatePresence>
            {notice && (
              <Toast.Root
                key={notice.id}
                open
                onOpenChange={(open) => {
                  if (!open) setNotice((current) => (current?.id === notice.id ? null : current));
                }}
                asChild
                forceMount
              >
                <motion.li
                  className="toast"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.18 }}
                >
                  <span className="toast-check">
                    <Check size={18} />
                  </span>
                  <Toast.Description>{notice.message}</Toast.Description>
                  <Toast.Close className="icon-button" aria-label="Dismiss message">
                    <X size={18} />
                  </Toast.Close>
                </motion.li>
              </Toast.Root>
            )}
          </AnimatePresence>
          <Toast.Viewport className="toast-viewport" />
        </Toast.Provider>
      </ToastContext.Provider>
    </ConfirmContext.Provider>
  );
}
