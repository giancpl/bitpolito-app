import { Dialog, DropdownMenu, Avatar as RadixAvatar } from "radix-ui";
import { AnimatePresence, motion } from "motion/react";
import { Link } from "react-router-dom";
import { useConfirm } from "./Feedback";
import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type ButtonHTMLAttributes,
  type FormEvent,
  type CSSProperties,
} from "react";
import {
  X,
  ArrowUpRight,
  AlertCircle,
  LoaderCircle,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

export function Button({
  children,
  busy,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      type="button"
      className={`button ${variant} ${className}`}
      {...props}
      disabled={busy || props.disabled}
      aria-busy={busy || undefined}
    >
      {busy && <LoaderCircle size={18} className="spin" />}
      {children}
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide,
  sheet,
  beforeClose,
  onClosing,
  description,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  sheet?: boolean;
  beforeClose?: () => Promise<boolean>;
  onClosing?: () => void;
  description?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef<HTMLElement | null>(
    document.activeElement as HTMLElement | null,
  );
  const [shown, setShown] = useState(true);
  const [viewport, setViewport] = useState<{ height: number; top: number }>();
  useEffect(() => {
    const visual = window.visualViewport;
    if (!visual) return;
    const update = () => {
      setViewport({ height: visual.height, top: visual.offsetTop });
      requestAnimationFrame(() => {
        const focused = document.activeElement as HTMLElement | null;
        if (
          focused?.matches("input,textarea,select") &&
          ref.current?.contains(focused)
        )
          focused.scrollIntoView({ block: "nearest" });
      });
    };
    update();
    visual.addEventListener("resize", update);
    visual.addEventListener("scroll", update);
    return () => {
      visual.removeEventListener("resize", update);
      visual.removeEventListener("scroll", update);
    };
  }, []);
  const closing = useRef(false);
  const confirm = useConfirm();
  const requestClose = async () => {
    if (closing.current || !shown) return;
    closing.current = true;
    try {
      if (
        ref.current?.querySelector('form[data-dirty="true"]') &&
        !(await confirm({
          title: "Discard your changes?",
          description: "Your unsaved changes will be lost.",
          action: "Discard changes",
          danger: true,
        }))
      )
        return;
      ref.current
        ?.querySelectorAll('form[data-dirty="true"]')
        .forEach((form) => ((form as HTMLElement).dataset.dirty = "false"));
      if (beforeClose && !(await beforeClose())) return;
      onClosing?.();
      setShown(false);
    } finally {
      closing.current = false;
    }
  };
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) void requestClose();
      }}
    >
      <AnimatePresence onExitComplete={onClose}>
        {shown && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className={`modal-backdrop ${sheet ? "sheet-backdrop" : ""}`}
                style={
                  viewport
                    ? ({
                        height: viewport.height,
                        top: viewport.top,
                        bottom: "auto",
                        "--panel-viewport-height": `${viewport.height}px`,
                      } as CSSProperties)
                    : undefined
                }
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <Dialog.Content
                  asChild
                  forceMount
                  onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    ref.current
                      ?.querySelector<HTMLElement>(".modal-close")
                      ?.focus();
                  }}
                  onCloseAutoFocus={(e) => {
                    e.preventDefault();
                    const target = previous.current?.isConnected &&
                      previous.current !== document.body &&
                      previous.current !== document.documentElement
                      ? previous.current
                      : document.querySelector<HTMLElement>(".profile-link");
                    target?.focus({ preventScroll: true });
                  }}
                >
                  <motion.div
                    ref={ref}
                    className={`modal ${wide ? "wide" : ""} ${sheet ? "sheet" : ""} ${className}`}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 12, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="modal-heading">
                      <Dialog.Title>{title}</Dialog.Title>
                      <button
                        type="button"
                        className="icon-button modal-close"
                        aria-label="Close dialog"
                        onClick={() => void requestClose()}
                      >
                        <X size={22} />
                      </button>
                    </div>
                    <Dialog.Description
                      className={description ? "modal-description" : "sr-only"}
                    >
                      {description ||
                        `${title}. Close or press Escape to return.`}
                    </Dialog.Description>
                    {children}
                  </motion.div>
                </Dialog.Content>
              </motion.div>
            </Dialog.Overlay>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

export function Avatar({
  name,
  small = false,
}: {
  name: string;
  small?: boolean;
}) {
  return (
    <RadixAvatar.Root className={`avatar ${small ? "avatar-small" : ""}`}>
      <RadixAvatar.Fallback>
        {(name || "BP").slice(0, 2).toUpperCase()}
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
}
export function AvatarGroup({
  people,
}: {
  people: { id: string; name: string }[];
}) {
  return (
    <span className="avatar-group" aria-hidden="true">
      {people.slice(0, 5).map((p) => (
        <Avatar key={p.id} name={p.name} small />
      ))}
      {people.length > 5 && (
        <span className="avatar avatar-small avatar-more">
          +{people.length - 5}
        </span>
      )}
    </span>
  );
}
export function StatusBadge({ inside }: { inside: boolean }) {
  return (
    <span className={`status-label ${inside ? "status-in" : ""}`}>
      <span className="status-dot" aria-hidden="true" />
      <span>{inside ? "In the office" : "Outside"}</span>
    </span>
  );
}
export function SettingsRow({
  icon,
  label,
  detail,
  onClick,
  to,
  danger,
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  onClick?: () => void;
  to?: string;
  danger?: boolean;
}) {
  const content = (
    <>
      <span className="settings-icon">{icon}</span>
      <span className="settings-label">
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </span>
      <span className="settings-chevron" aria-hidden="true">
        ›
      </span>
    </>
  );
  return to ? (
    <Link
      to={to}
      aria-label={label}
      className={`settings-row ${danger ? "danger-text" : ""}`}
    >
      {content}
    </Link>
  ) : (
    <button
      type="button"
      aria-label={label}
      className={`settings-row ${danger ? "danger-text" : ""}`}
      onClick={onClick}
    >
      {content}
    </button>
  );
}
export function TransitionView({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      key={id}
      className="transition-view"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
    >
      {children}
    </motion.div>
  );
}
const Errors = createContext<Record<string, string>>({});
export class FieldError extends Error {
  constructor(public fields: Record<string, string>) {
    super("Check the highlighted fields.");
  }
}
export function Field({
  label,
  children,
  help,
}: {
  label: string;
  children: ReactNode;
  help?: string;
}) {
  const id = useId(),
    errors = useContext(Errors);
  const [nativeError, setNativeError] = useState("");
  const child = isValidElement(children)
    ? (children as ReactElement<any>)
    : null;
  const error = errors[child?.props.name] || nativeError;
  return (
    <label className="field">
      <span>
        {label}
        {child?.props.required && (
          <span className="required-label">Required</span>
        )}
      </span>
      {child
        ? cloneElement(child, {
            "aria-label": label,
            "aria-invalid": error ? true : undefined,
            "aria-describedby":
              [help ? `${id}-help` : "", error ? `${id}-error` : ""]
                .filter(Boolean)
                .join(" ") || undefined,
            onInvalid: (e: any) => {
              e.preventDefault();
              setNativeError(e.target.validationMessage);
              child.props.onInvalid?.(e);
            },
            onChange: (e: any) => {
              setNativeError("");
              child.props.onChange?.(e);
            },
          })
        : children}
      {help && <small id={`${id}-help`}>{help}</small>}
      {error && (
        <span id={`${id}-error`} className="field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice" role="alert">
      <AlertCircle size={20} />
      <div>{children}</div>
    </div>
  );
}
export function Empty({
  icon = "cow-icon-blue.svg",
  title,
  children,
  action,
}: {
  icon?: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <img src={`/brand/${icon}`} alt="" />
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading-skeleton" role="status">
      <span className="sr-only">Loading…</span>
      <span />
      <span />
      <span />
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <div className="error-state">
      <Notice>{error.message}</Notice>
      <Button variant="secondary" onClick={retry}>
        <RefreshCw size={18} />
        Try again
      </Button>
    </div>
  );
}
export function ExternalLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight size={18} />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
export function AsyncForm({
  children,
  onSubmit,
  submitLabel,
  initialError = "",
}: {
  children: ReactNode;
  onSubmit: (data: FormData) => Promise<void>;
  submitLabel: string;
  initialError?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(initialError),
    [fields, setFields] = useState<Record<string, string>>({}),
    [dirty, setDirty] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setFields({});
    setError("");
    if (!e.currentTarget.checkValidity()) {
      e.currentTarget.querySelector<HTMLElement>(":invalid")?.focus();
      return;
    }
    const data = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await onSubmit(data);
      setDirty(false);
      if (ref.current) ref.current.dataset.dirty = "false";
    } catch (e) {
      if (e instanceof FieldError) {
        setFields(e.fields);
        const name = Object.keys(e.fields)[0];
        ref.current
          ?.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`)
          ?.focus();
      }
      setError(e instanceof Error ? e.message : "Please try again");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Errors.Provider value={fields}>
      <form
        ref={ref}
        className="form"
        noValidate
        data-dirty={dirty}
        onSubmit={submit}
        onChange={(e) => {
          setDirty(true);
          const name = (e.target as unknown as HTMLInputElement).name;
          setFields((old) => {
            const next = { ...old };
            delete next[name];
            return next;
          });
        }}
      >
        <fieldset disabled={busy}>{children}</fieldset>
        {error && <Notice>{error}</Notice>}
        <Button type="submit" busy={busy}>
          {submitLabel}
        </Button>
      </form>
    </Errors.Provider>
  );
}
export function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  if (!text) return null;
  return (
    <div className="expandable-text">
      <p id={id}>
        {text.length > 240 && !expanded
          ? `${text.slice(0, 240).trimEnd()}…`
          : text}
      </p>
      {text.length > 240 && (
        <button
          type="button"
          className="text-button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
export function MoreActions({
  title,
  onEdit,
  onDelete,
}: {
  title: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="icon-button"
          aria-label={`More actions for ${title}`}
        >
          <MoreHorizontal size={22} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="menu-content"
          sideOffset={8}
          align="end"
        >
          <DropdownMenu.Item className="menu-item" onSelect={onEdit}>
            <Pencil size={18} />
            Edit
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="menu-item danger-text"
            onSelect={onDelete}
          >
            <Trash2 size={18} />
            Delete
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
