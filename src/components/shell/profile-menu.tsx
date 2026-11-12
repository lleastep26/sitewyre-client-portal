"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { HardHat, LogOut, Settings, User } from "lucide-react";
import { signOut } from "@/app/(auth)/login/actions";

export function ProfileMenu({ email }: { email: string | null }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-charcoal/10 text-charcoal hover:bg-charcoal/15"
        >
          <User className="h-5 w-5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-56 rounded-xl border border-charcoal/10 bg-white p-1.5 shadow-lg"
        >
          {email ? (
            <p className="truncate px-3 py-2 text-xs text-charcoal/50">{email}</p>
          ) : null}
          <DropdownMenu.Item asChild>
            <Link
              href="/settings"
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-charcoal outline-none hover:bg-charcoal/5"
            >
              <Settings className="h-4 w-4" />
              Account
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link
              href="/crew"
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-charcoal outline-none hover:bg-charcoal/5"
            >
              <HardHat className="h-4 w-4" />
              Crew mode
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-charcoal/10" />
          <DropdownMenu.Item asChild>
            <form action={signOut}>
              <button
                type="submit"
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-charcoal outline-none hover:bg-charcoal/5"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </form>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
