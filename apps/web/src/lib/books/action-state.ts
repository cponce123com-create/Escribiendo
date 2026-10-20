export interface LibraryActionState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
}

export const initialLibraryActionState: LibraryActionState = { status: "idle" };
