import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { EsquemaDesactualizado } from "@/components/app/schema-error";
import { isAppError } from "@/lib/errors";

export default async function HomePage() {
  let session = null;

  try {
    session = await getSession();
  } catch (error) {
    if (isAppError(error) && error.code === "CONFIGURATION_ERROR") {
      return <EsquemaDesactualizado />;
    }

    throw error;
  }

  redirect(session ? "/dashboard" : "/login");
}
