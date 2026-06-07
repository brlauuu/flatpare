# Security Vulnerabilities Assessment

This document lists identified security vulnerabilities in the Flatpare codebase and the recommended (or implemented) fixes.

## 1. Broken Access Control in Auth API

**Severity: High**

The `src/proxy.ts` file (the authentication gate) allow-listed all routes starting with `/api/auth/*` without any authentication checks. This exposed several sensitive endpoints to unauthenticated users.

*   **Vulnerability:** Unauthenticated users could access:
    *   `GET /api/auth/users`: List all registered display names.
    *   `DELETE /api/auth/users/[name]`: Delete any user and their associated ratings.
    *   `POST /api/auth/name`: Register new users in the database without knowing the `APP_PASSWORD`.
*   **Fix:** Restrict the proxy allow-list to only the main login endpoint (`POST /api/auth`). All other auth-related endpoints now require the `flatpare-auth` cookie.

## 2. Insecure Cookie-Based Authentication

**Severity: Medium**

The authentication mechanism relies on a `flatpare-auth=true` cookie.

*   **Vulnerability:** The cookie value is a static string (`true`) and is not verified against any server-side secret or cryptographic signature. An attacker who knows the cookie name can manually set it in their browser to bypass the password protection.
*   **Recommendation:** Implement a signed cookie or a simple JWT to ensure the authentication cookie cannot be forged.

## 3. Timing Attack Vulnerability in Password Verification

**Severity: Low**

The `verifyPassword` function used a standard string equality check.

*   **Vulnerability:** Standard string comparison (`===`) returns as soon as it finds a mismatching character. This allows an attacker to potentially brute-force the password by measuring the time the server takes to respond.
*   **Fix:** Use `crypto.timingSafeEqual` for constant-time comparison of the password.

## 4. Potential XSS in Guide Page

**Severity: Medium**

The `/guide` page renders HTML from Markdown using `dangerouslySetInnerHTML`.

*   **Vulnerability:** While the Markdown file is currently local, rendering its output directly as HTML without sanitization is risky. If the content were ever influenced by external input, it could lead to Cross-Site Scripting (XSS).
*   **Fix:** Sanitize the generated HTML using a library like `isomorphic-dompurify` before rendering.
