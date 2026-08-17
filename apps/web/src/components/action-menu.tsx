"use client";

import { Ellipsis } from "lucide-react";
import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const VIEWPORT_GAP = 12;
const ANCHOR_GAP = 6;
const DEFAULT_MENU_WIDTH = 220;
const DEFAULT_MENU_HEIGHT = 240;

export type ActionMenuAnchorRect = Pick<DOMRect, "top" | "right" | "bottom">;

export type ActionMenuPosition = {
  left: number;
  maxHeight: number;
  top: number;
  width: number;
};

export function calculateActionMenuPosition(
  anchor: ActionMenuAnchorRect,
  viewport: { height: number; width: number },
  menu: { height: number; width: number } = {
    height: DEFAULT_MENU_HEIGHT,
    width: DEFAULT_MENU_WIDTH,
  },
): ActionMenuPosition {
  const width = Math.min(
    menu.width,
    Math.max(0, viewport.width - VIEWPORT_GAP * 2),
  );
  const left = Math.min(
    Math.max(VIEWPORT_GAP, anchor.right - width),
    Math.max(VIEWPORT_GAP, viewport.width - width - VIEWPORT_GAP),
  );
  const spaceBelow = Math.max(
    0,
    viewport.height - anchor.bottom - ANCHOR_GAP - VIEWPORT_GAP,
  );
  const spaceAbove = Math.max(0, anchor.top - ANCHOR_GAP - VIEWPORT_GAP);
  const openBelow =
    spaceBelow >= Math.min(menu.height, DEFAULT_MENU_HEIGHT) ||
    spaceBelow >= spaceAbove;
  const maxHeight = openBelow ? spaceBelow : spaceAbove;
  const visibleHeight = Math.min(menu.height, maxHeight);
  const top = openBelow
    ? anchor.bottom + ANCHOR_GAP
    : Math.max(VIEWPORT_GAP, anchor.top - ANCHOR_GAP - visibleHeight);

  return { left, maxHeight, top, width };
}

function actionableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [role="menuitem"]:not([aria-disabled="true"])',
    ),
  );
}

export function ActionMenu({
  children,
  label = "Abrir ações",
}: {
  children: ReactNode;
  label?: string;
}) {
  const items = Children.toArray(children).filter(isValidElement);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<ActionMenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const menu = menuRef.current;
    setPosition(
      calculateActionMenuPosition(
        trigger.getBoundingClientRect(),
        { height: window.innerHeight, width: window.innerWidth },
        {
          height: menu?.scrollHeight ?? DEFAULT_MENU_HEIGHT,
          width: menu?.offsetWidth || DEFAULT_MENU_WIDTH,
        },
      ),
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const frame = window.requestAnimationFrame(() => {
      updatePosition();
      actionableElements(menuRef.current)[0]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleViewportChange = () => updatePosition();
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updatePosition]);

  if (items.length === 0) return <span className="action-menu-empty">—</span>;

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const actions = actionableElements(menuRef.current);
    if (!actions.length) return;
    const current = actions.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? actions.length - 1
          : event.key === "ArrowDown"
            ? (current + 1) % actions.length
            : (current - 1 + actions.length) % actions.length;
    actions[next]?.focus();
  }

  function closeAfterAction(event: MouseEvent<HTMLDivElement>) {
    const action = (event.target as Element).closest("a, button");
    if (action && !(action instanceof HTMLButtonElement && action.disabled)) {
      setOpen(false);
    }
  }

  const enhancedItems = items.map((child, index) =>
    cloneElement(child as ReactElement<{ role?: string; tabIndex?: number }>, {
      role: "menuitem",
      tabIndex: index === 0 ? 0 : -1,
    }),
  );
  const menuStyle = position
    ? ({
        left: position.left,
        maxHeight: position.maxHeight,
        top: position.top,
        width: position.width,
      } satisfies CSSProperties)
    : undefined;

  return (
    <span className="action-menu-cell">
      <button
        ref={triggerRef}
        className="action-menu-trigger"
        type="button"
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
      >
        <Ellipsis aria-hidden="true" size={19} strokeWidth={2.4} />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="action-menu-popover"
              role="menu"
              aria-label={label}
              style={menuStyle}
              onClick={closeAfterAction}
              onKeyDown={handleMenuKeyDown}
            >
              {enhancedItems}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
