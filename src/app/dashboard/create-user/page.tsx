import { redirect } from "next/navigation";

// Superseded by Team (/dashboard/users), which creates workers and office users and starts their onboarding.
export default function CreateUserPage() {
  redirect("/dashboard/users");
}
