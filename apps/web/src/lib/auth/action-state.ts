import type { ActionState } from "@/lib/action-state";

export type AuthActionState = ActionState;

export const initialAuthActionState: AuthActionState = { status: "idle" };

export const initialPasswordActionState: AuthActionState = { status: "idle" };
