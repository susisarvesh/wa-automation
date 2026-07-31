"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { Conversation } from "@/types";

/**
 * Count of conversations with at least one unread inbound message.
 * Subscribe once via TotalUnreadProvider — Sidebar + MobileNav share it
 * so we never re-attach postgres_changes after subscribe() on the same
 * channel topic.
 */
const TotalUnreadContext = createContext(0);

function useTotalUnreadState(): number {
  const [total, setTotal] = useState(0);
  const countsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, unread_count");
      if (cancelled || error || !data) return;

      const map = new Map<string, number>();
      let sum = 0;
      for (const row of data as { id: string; unread_count: number }[]) {
        const n = row.unread_count ?? 0;
        map.set(row.id, n);
        if (n > 0) sum += 1;
      }
      countsRef.current = map;
      setTotal(sum);
    })();

    // Unique topic per mount — avoids colliding with a leftover channel
    // during Strict Mode remounts.
    const topic = `total-unread-realtime:${crypto.randomUUID()}`;
    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        (payload) => {
          const map = countsRef.current;
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Partial<Conversation>;
            if (oldRow.id) map.delete(oldRow.id);
          } else {
            const row = payload.new as Conversation;
            map.set(row.id, row.unread_count ?? 0);
          }
          let sum = 0;
          for (const n of map.values()) if (n > 0) sum += 1;
          setTotal(sum);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  return total;
}

export function TotalUnreadProvider({ children }: { children: ReactNode }) {
  const total = useTotalUnreadState();
  return (
    <TotalUnreadContext.Provider value={total}>
      {children}
    </TotalUnreadContext.Provider>
  );
}

export function useTotalUnread(): number {
  return useContext(TotalUnreadContext);
}
