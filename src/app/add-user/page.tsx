import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { AddUserForm } from "./add-user-form";

export default async function AddUserPage() {
  if (!(await isAuthenticated())) {
    redirect("/");
  }
  return <AddUserForm />;
}
