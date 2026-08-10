"use client";

import type { NotificationSummary, PaginatedResponse } from "@prumo/contracts";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/auth-context";

export function NotificationBell() {
  const { request } = useAuth();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationSummary[]>([]);
  const load = useCallback(async () => {
    const [counter, latest] = await Promise.all([
      request<{ count: number }>("/notifications/unread-count"),
      request<PaginatedResponse<NotificationSummary>>(
        "/notifications?page=1&pageSize=5",
      ),
    ]);
    setCount(counter.count);
    setItems(latest.data);
  }, [request]);
  useEffect(() => {
    const initial = window.setTimeout(
      () => void load().catch(() => undefined),
      0,
    );
    const timer = window.setInterval(
      () => void load().catch(() => undefined),
      30_000,
    );
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);
  return (
    <div className="notification-bell">
      <button
        aria-label={`${count} notificações não lidas`}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">N</span>
        {count > 0 && <b>{count > 99 ? "99+" : count}</b>}
      </button>
      {open && (
        <div className="notification-popover">
          <header>
            <strong>Notificações</strong>
            <Link href="/notifications" onClick={() => setOpen(false)}>
              Ver todas
            </Link>
          </header>
          {items.map((item) => (
            <button
              className={item.readAt ? "" : "unread"}
              key={item.id}
              onClick={async () => {
                if (!item.readAt)
                  await request(`/notifications/${item.id}/read`, {
                    method: "POST",
                  });
                setOpen(false);
                if (item.actionUrl) window.location.assign(item.actionUrl);
                await load();
              }}
            >
              <strong>{item.title}</strong>
              <span>{item.body}</span>
            </button>
          ))}
          {!items.length && <p>Nenhuma notificação.</p>}
        </div>
      )}
    </div>
  );
}
