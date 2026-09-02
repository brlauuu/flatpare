import { NextResponse } from "next/server";

// Legacy endpoint, retired. It used to delete `ratings` and `users` rows by
// display name with no household predicate at all — under multi-tenancy that
// is a cross-tenant destructive operation on a route the proxy allow-lists
// wholesale (`/api/auth/*`, ruling R3), and display names are not unique
// across households in the first place.
//
// Removing a member is issue #197 / E5, explicitly out of scope here, so this
// answers 410 and touches no data. Task 6 deletes the file with the rest of
// the shared-password model.
export async function DELETE() {
  return NextResponse.json(
    {
      error:
        "Removing a user by display name is no longer supported. Household membership is managed per account.",
    },
    { status: 410 }
  );
}
