import sgMail from "@sendgrid/mail";

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function maskEmail(value) {
    const email = String(value || "").trim();
    if (!isValidEmail(email)) {
        return "<invalid-email>";
    }

    const atIndex = email.indexOf("@");
    const local = email.slice(0, atIndex);
    const domain = email.slice(atIndex + 1);

    const maskedLocal = local.length <= 2
        ? `${local.charAt(0) || "*"}*`
        : `${local.slice(0, 2)}***`;

    return `${maskedLocal}@${domain}`;
}

function getSendGridConfig() {
    const apiKey = String(process.env.SENDGRID_API_KEY || "").trim();
    const from = String(process.env.EMAIL_FROM || "").trim();
    const replyTo = String(process.env.EMAIL_REPLY_TO || "").trim();

    if (!apiKey || !from) {
        return null;
    }

    return { apiKey, from, replyTo };
}

function formatEmailTimestamp(value) {
    const timestamp = value instanceof Date ? value : new Date(value || Date.now());

    try {
        return new Intl.DateTimeFormat("en-PH", {
            dateStyle: "medium",
            timeStyle: "short",
            hour12: true,
            timeZone: process.env.EMAIL_TIME_ZONE || "Asia/Manila"
        }).format(timestamp);
    } catch {
        return timestamp.toLocaleString("en-PH");
    }
}

async function sendWithSendGrid({ to, subject, text, html }) {
    const config = getSendGridConfig();
    if (!config) {
        console.warn("Email service: SendGrid not configured - missing SENDGRID_API_KEY or EMAIL_FROM");
        return { sent: false, reason: "SendGrid is not configured" };
    }

    sgMail.setApiKey(config.apiKey);

    try {
        await sgMail.send({
            to,
            from: config.from,
            subject,
            text,
            html,
            ...(config.replyTo ? { replyTo: config.replyTo } : {})
        });

        return { sent: true };
    } catch (error) {
        const message = Array.isArray(error?.response?.body?.errors)
            ? error.response.body.errors.map((item) => item.message).filter(Boolean).join("; ")
            : error?.message || "SendGrid request failed";
        return { sent: false, reason: message };
    }
}

export async function sendPasswordChangedEmail({ userEmail, userName, changedAt, actorEmail }) {
    const recipient = String(userEmail || "").trim();
    const maskedRecipient = maskEmail(recipient);
    if (!isValidEmail(recipient)) {
        console.warn(`Email service: Skipping password-change email due to invalid recipient '${maskedRecipient}'`);
        return { sent: false, reason: "Invalid recipient email" };
    }

    const safeName = String(userName || "User").trim() || "User";
    const changedTime = formatEmailTimestamp(changedAt);
    const changedBy = String(actorEmail || "an administrator").trim();

    console.log(`Email service: Attempting to send password change email to ${maskedRecipient}`);

    const text = [
        `Dear ${safeName},`,
        "",
        `This is a security notice that your password was changed on ${changedTime}.`,
        `Changed by: ${changedBy}.`,
        "",
        "If this wasn't you, please contact the admin immediately.",
        ""
    ].join("\n");

    const html = `
        <p>Dear ${safeName},</p>
        <p>This is a security notice that your password was changed on <strong>${changedTime}</strong>.</p>
        <p>Changed by: <strong>${changedBy}</strong>.</p>
        <p>If this wasn't you, please contact the admin immediately.</p>
    `;

    const result = await sendWithSendGrid({
        to: recipient,
        subject: "Is this you? Password changed",
        text,
        html
    });

    if (result.sent) {
        console.log(`Email service: Successfully sent password change email to ${maskedRecipient}`);
        return { sent: true };
    }

    console.error(`Email service error: Failed to send to ${maskedRecipient} - ${result.reason}`);
    return { sent: false, reason: result.reason };
}

export async function sendPasswordResetCodeEmail({ userEmail, userName, code, expiresInMinutes }) {
    const recipient = String(userEmail || "").trim();
    const maskedRecipient = maskEmail(recipient);
    if (!isValidEmail(recipient)) {
        console.warn(`Email service: Skipping reset-code email due to invalid recipient '${maskedRecipient}'`);
        return { sent: false, reason: "Invalid recipient email" };
    }

    const safeName = String(userName || "User").trim() || "User";
    const safeCode = String(code || "").trim();
    const ttl = Number.parseInt(expiresInMinutes || "10", 10) || 10;

    if (!safeCode) {
        return { sent: false, reason: "Reset code is missing" };
    }

    const text = [
        `Dear ${safeName},`,
        "",
        "We received a request to reset your password.",
        `Your verification code is: ${safeCode}`,
        `This code expires in ${ttl} minutes.`,
        "",
        "If you did not request this reset, you can ignore this email.",
        ""
    ].join("\n");

    const html = `
        <p>Dear ${safeName},</p>
        <p>We received a request to reset your password.</p>
        <p>Your verification code is:</p>
        <p style="font-size: 20px; font-weight: 700; letter-spacing: 2px;">${safeCode}</p>
        <p>This code expires in <strong>${ttl} minutes</strong>.</p>
        <p>If you did not request this reset, you can ignore this email.</p>
    `;

    console.log(`Email service: Attempting to send reset code email to ${maskedRecipient}`);
    const result = await sendWithSendGrid({
        to: recipient,
        subject: "Your password reset code",
        text,
        html
    });

    if (result.sent) {
        console.log(`Email service: Successfully sent reset code email to ${maskedRecipient}`);
        return { sent: true };
    }

    console.error(`Email service error: Failed reset code email to ${maskedRecipient} - ${result.reason}`);
    return { sent: false, reason: result.reason };
}

export async function sendEmailChangeCodeEmail({ userEmail, userName, code, expiresInMinutes }) {
    const recipient = String(userEmail || "").trim();
    const maskedRecipient = maskEmail(recipient);
    if (!isValidEmail(recipient)) {
        console.warn(`Email service: Skipping email-change code email due to invalid recipient '${maskedRecipient}'`);
        return { sent: false, reason: "Invalid recipient email" };
    }

    const safeName = String(userName || "User").trim() || "User";
    const safeCode = String(code || "").trim();
    const ttl = Number.parseInt(expiresInMinutes || "10", 10) || 10;

    if (!safeCode) {
        return { sent: false, reason: "Verification code is missing" };
    }

    const text = [
        `Dear ${safeName},`,
        "",
        "We received a request to change the email address on your account.",
        `Your verification code is: ${safeCode}`,
        `This code expires in ${ttl} minutes.`,
        "",
        "If you did not request this change, you can ignore this email.",
        ""
    ].join("\n");

    const html = `
        <p>Dear ${safeName},</p>
        <p>We received a request to change the email address on your account.</p>
        <p>Your verification code is:</p>
        <p style="font-size: 20px; font-weight: 700; letter-spacing: 2px;">${safeCode}</p>
        <p>This code expires in <strong>${ttl} minutes</strong>.</p>
        <p>If you did not request this change, you can ignore this email.</p>
    `;

    console.log(`Email service: Attempting to send email-change code to ${maskedRecipient}`);
    const result = await sendWithSendGrid({
        to: recipient,
        subject: "Verify your new email address",
        text,
        html
    });

    if (result.sent) {
        console.log(`Email service: Successfully sent email-change code to ${maskedRecipient}`);
        return { sent: true };
    }

    console.error(`Email service error: Failed email-change code to ${maskedRecipient} - ${result.reason}`);
    return { sent: false, reason: result.reason };
}

export async function sendEmailChangedAlertEmail({ oldEmail, userName, newEmail, changedAt }) {
    const recipient = String(oldEmail || "").trim();
    const maskedRecipient = maskEmail(recipient);
    if (!isValidEmail(recipient)) {
        console.warn(`Email service: Skipping email-change alert due to invalid old email '${maskedRecipient}'`);
        return { sent: false, reason: "Invalid recipient email" };
    }

    const safeName = String(userName || "User").trim() || "User";
    const safeNewEmail = String(newEmail || "").trim();
    const changedTime = formatEmailTimestamp(changedAt);

    const text = [
        `Dear ${safeName},`,
        "",
        `This is a security notice that your account email was changed on ${changedTime}.`,
        `New email address: ${safeNewEmail || "(not available)"}`,
        "",
        "If you did not perform this action, please contact support immediately.",
        ""
    ].join("\n");

    const html = `
        <p>Dear ${safeName},</p>
        <p>This is a security notice that your account email was changed on <strong>${changedTime}</strong>.</p>
        <p>New email address: <strong>${safeNewEmail || "(not available)"}</strong>.</p>
        <p>If you did not perform this action, please contact support immediately.</p>
    `;

    console.log(`Email service: Attempting to send email-change alert to old email ${maskedRecipient}`);
    const result = await sendWithSendGrid({
        to: recipient,
        subject: "Security notice: Your account email was changed",
        text,
        html
    });

    if (result.sent) {
        console.log(`Email service: Successfully sent email-change alert to ${maskedRecipient}`);
        return { sent: true };
    }

    console.error(`Email service error: Failed email-change alert to ${maskedRecipient} - ${result.reason}`);
    return { sent: false, reason: result.reason };
}
