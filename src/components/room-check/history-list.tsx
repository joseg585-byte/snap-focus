"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface RoomCheckHistoryItem {
  id: string;
  level: string;
  overallPass: boolean | null;
  summary: string | null;
  areas: { title: string; pass: boolean; note: string }[];
  creditsSpent: number;
  createdAt: string;
  photoUrls: string[];
}

export function RoomCheckHistoryList({ items }: { items: RoomCheckHistoryItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (items.length === 0) {
    return <p className="mt-6 text-cream/60">No room checks yet.</p>;
  }

  return (
    <div className="mt-6 space-y-3">
      {items.map((item) => {
        const open = openId === item.id;
        return (
          <Card key={item.id} className="cursor-pointer" onClick={() => setOpenId(open ? null : item.id)}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold capitalize text-cream">
                  {item.overallPass ? "✓" : "✗"} {item.level} check
                </p>
                <p className="text-sm text-cream/50">
                  {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>
              <Badge>-{item.creditsSpent} credits</Badge>
            </div>

            {open && (
              <div className="mt-4 space-y-4 border-t border-cream/10 pt-4">
                {item.summary && <p className="text-sm text-cream/70">{item.summary}</p>}
                <ul className="space-y-3">
                  {item.areas.map((area, i) => (
                    <li key={i} className="flex gap-3">
                      {item.photoUrls[i] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.photoUrls[i]}
                          alt={area.title}
                          className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
                        />
                      )}
                      <div>
                        <p className="text-sm font-semibold text-cream">
                          {area.pass ? "✓" : "✗"} {area.title}
                        </p>
                        <p className="text-sm text-cream/60">{area.note}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
