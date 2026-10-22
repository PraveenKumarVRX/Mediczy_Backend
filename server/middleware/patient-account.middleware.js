/** A corporate/doctor integer ID must never be treated as a users-table patient ID. */
export function patientAccountOnly(req, res, next) {
  if (
    req.user?.userType === "corporate" ||
    !["user", "patient", "employee"].includes(req.user?.role)
  )
    return res
      .status(403)
      .json({
        success: false,
        message: "Sign in with your own employee or patient account",
      });
  return next();
}
