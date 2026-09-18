import { createHmac } from 'node:crypto';
import nodemailer from 'nodemailer';

import type { InquiryRecord } from './store';

/**
 * 咨询提交后的通知。两个通道都可选，没配置就静默跳过，不影响表单提交。
 * 配置都通过环境变量，上线前不用改这里的代码。
 */

type NotifyInput = {
  name: string;
  phone: string;
  email: string;
  caseType: string;
  message: string;
  siteName: string;
};

function buildText(input: NotifyInput): string {
  return [
    `【新咨询】${input.siteName}`,
    `姓名：${input.name}`,
    `电话：${input.phone}`,
    `邮箱：${input.email || '未填写'}`,
    `咨询类型：${input.caseType || '未选择'}`,
    `内容：${input.message}`,
  ].join('\n');
}

async function sendDingTalk(text: string): Promise<void> {
  const webhook = process.env.DINGTALK_WEBHOOK;
  if (!webhook) return;

  let url = webhook;
  const secret = process.env.DINGTALK_SECRET;
  if (secret) {
    const timestamp = Date.now();
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}\n${secret}`)
      .digest('base64');
    url = `${webhook}${webhook.includes('?') ? '&' : '?'}timestamp=${timestamp}&sign=${encodeURIComponent(signature)}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'text',
      text: { content: text },
    }),
  });

  if (!response.ok) throw new Error(`钉钉通知失败：HTTP ${response.status}`);
}

async function sendEmail(text: string): Promise<void> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.NOTIFY_EMAIL;
  if (!host || !user || !pass || !to) return;

  const port = Number(process.env.SMTP_PORT ?? 465);
  const secure = process.env.SMTP_SECURE !== 'false';

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: user,
    to,
    subject: '网站新咨询',
    text,
  });
}

export function notifyNewInquiry(input: NotifyInput): Promise<void> {
  const text = buildText(input);

  return Promise.allSettled([sendDingTalk(text), sendEmail(text)]).then((results) => {
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('[notify] 咨询通知发送失败：', result.reason);
      }
    }
  });
}

export type { NotifyInput as InquiryNotifyInput };
