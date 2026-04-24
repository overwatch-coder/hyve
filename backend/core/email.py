"""
Email utility for sending study invite links.

Required environment variables (set in .env):
    SMTP_HOST       — SMTP server hostname  (e.g. smtp.gmail.com)
    SMTP_PORT       — SMTP port             (default: 587)
    SMTP_USER       — Login username / sending address
    SMTP_PASSWORD   — Password or app-specific password
    SMTP_FROM       — Display sender address (defaults to SMTP_USER)
    FRONTEND_URL    — Base URL of the frontend (e.g. https://hyve.vercel.app)
"""

import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional


def _get_cfg():
    host = os.getenv("SMTP_HOST", "")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASSWORD", "")
    from_addr = os.getenv("SMTP_FROM", user)
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    return host, port, user, password, from_addr, frontend_url


def email_configured() -> bool:
    """Return True if all required SMTP vars are set."""
    host, _, user, password, _, _ = _get_cfg()
    return bool(host and user and password)


def send_invite_email(
    to_email: str,
    invite_code: str,
    study_title: str,
    platform: Optional[str] = None,
) -> None:
    """
    Send a study participation invite email.

    Raises ValueError if SMTP is not configured.
    Raises smtplib.SMTPException on send failure.
    """
    host, port, user, password, from_addr, frontend_url = _get_cfg()

    if not (host and user and password):
        raise ValueError(
            "Email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD in your .env file."
        )

    invite_url = f"{frontend_url}/study/{invite_code}"

    html = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>HYVE Research Study Invitation</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#111111;border-radius:16px;border:1px solid #222222;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #1a1a1a;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#7c3aed22;border:1px solid #7c3aed44;border-radius:10px;
                              padding:10px 14px;vertical-align:middle;">
                    <span style="font-size:18px;">⚡</span>
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;">
                    <span style="font-size:11px;font-weight:900;letter-spacing:0.2em;
                                  text-transform:uppercase;color:#7c3aed;">
                      HYVE Research
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <h1 style="margin:0 0 12px;font-size:24px;font-weight:900;
                          letter-spacing:-0.5px;color:#ffffff;">
                You're invited to participate
              </h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#a1a1aa;">
                You have been selected to take part in the following research study:
              </p>

              <!-- Study card -->
              <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;
                           padding:20px 24px;margin:0 0 28px;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:900;letter-spacing:0.15em;
                            text-transform:uppercase;color:#7c3aed;">Study</p>
                <p style="margin:0;font-size:17px;font-weight:700;color:#ffffff;">
                  {study_title}
                </p>
              </div>

              <p style="margin:0 0 8px;font-size:13px;font-weight:700;
                          letter-spacing:0.05em;text-transform:uppercase;color:#71717a;">
                Your invite code
              </p>
              <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;
                           padding:16px 20px;margin:0 0 28px;text-align:center;">
                <span style="font-family:'Courier New',Courier,monospace;font-size:22px;
                               font-weight:900;letter-spacing:0.25em;color:#ffffff;">
                  {invite_code}
                </span>
              </div>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="{invite_url}"
                       style="display:inline-block;background:#7c3aed;color:#ffffff;
                               text-decoration:none;font-size:13px;font-weight:900;
                               letter-spacing:0.1em;text-transform:uppercase;
                               padding:14px 36px;border-radius:10px;">
                      Begin Study →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0;font-size:12px;color:#52525b;text-align:center;">
                Or paste this link into your browser:<br/>
                <a href="{invite_url}"
                   style="color:#7c3aed;word-break:break-all;">{invite_url}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #1a1a1a;text-align:center;">
              <p style="margin:0;font-size:11px;color:#3f3f46;line-height:1.6;">
                This study is completely anonymous. No personal information is collected.<br/>
                Your invite code is single-use — do not share it with others.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

    plain = (
        f"HYVE Research Study Invitation\n\n"
        f"You've been invited to participate in: {study_title}\n\n"
        f"Your invite code: {invite_code}\n\n"
        f"Click the link below to begin:\n{invite_url}\n\n"
        f"This is a single-use code — do not share it. The study is fully anonymous."
    )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Your HYVE Study Invitation — {study_title}"
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(host, port) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(user, password)
        server.sendmail(from_addr, [to_email], msg.as_string())
