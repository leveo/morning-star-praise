// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Leo Song
import type { ReactNode } from 'react';
import { useUILanguage, type UILanguage } from '../hooks/useLanguage';

type Section = {
  heading: string;
  body: ReactNode;
};

type PrivacyContent = {
  title: string;
  lastUpdated: string;
  sections: Section[];
};

const PRIVACY_EN: PrivacyContent = {
  title: 'Privacy Policy',
  lastUpdated: 'Last updated: April 12, 2026',
  sections: [
    {
      heading: '1. Information We Collect',
      body: (
        <>
          <h3 className="text-base font-medium text-slate-200">Account Information</h3>
          <p>
            When you sign in via Google OAuth, we receive your name, email address, and profile
            picture from Google. This is used solely for authentication and identifying your
            saved songs and templates.
          </p>
          <h3 className="text-base font-medium text-slate-200">User-Provided Content</h3>
          <p>
            Lyrics, song titles, composer names, and uploaded images that you provide while using
            the Service. This content is processed to generate presentation files and is not
            shared with third parties except as described below.
          </p>
          <h3 className="text-base font-medium text-slate-200">Automatically Collected</h3>
          <p>
            Basic server logs (IP address, request timestamps) for operational purposes.
            We do not use tracking cookies or analytics services.
          </p>
        </>
      ),
    },
    {
      heading: '2. How We Use Your Information',
      body: (
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong className="text-white">Authentication</strong> — To verify your identity and
            manage your account.
          </li>
          <li>
            <strong className="text-white">Service delivery</strong> — To generate PPT files,
            translate lyrics, and process uploaded images.
          </li>
          <li>
            <strong className="text-white">Song library</strong> — To save and retrieve your songs
            and templates for future use.
          </li>
        </ul>
      ),
    },
    {
      heading: '3. Third-Party Services',
      body: (
        <>
          <p>The Service uses the following third-party services to process your content:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong className="text-white">Google Gemini API</strong> — Used for lyrics
              translation and sheet music OCR. Text and images you submit for these features are
              sent to Google's API. See{' '}
              <a
                href="https://ai.google.dev/terms"
                className="text-gold-400 hover:text-gold-300"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google's AI Terms
              </a>
              .
            </li>
            <li>
              <strong className="text-white">YouTube (via youtube-transcript-api)</strong> — Used
              to retrieve publicly available subtitle tracks. No YouTube account data is accessed.
            </li>
            <li>
              <strong className="text-white">Google Cloud Platform</strong> — Hosting, database,
              and secret management in production. See{' '}
              <a
                href="https://cloud.google.com/terms"
                className="text-gold-400 hover:text-gold-300"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Cloud Terms
              </a>
              .
            </li>
          </ul>
        </>
      ),
    },
    {
      heading: '4. Data Retention',
      body: (
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong className="text-white">Generated PPT files</strong> — Automatically deleted
            after 1 hour.
          </li>
          <li>
            <strong className="text-white">Uploaded images (sheet music, backgrounds)</strong> —
            Temporary uploads are deleted after 1 hour. Custom backgrounds you add to your library
            are retained until you delete them.
          </li>
          <li>
            <strong className="text-white">Saved songs and templates</strong> — Retained until you
            delete them or request account deletion.
          </li>
          <li>
            <strong className="text-white">Account data</strong> — Retained as long as your
            account exists. Contact us to request deletion.
          </li>
        </ul>
      ),
    },
    {
      heading: '5. Data Security',
      body: (
        <p>
          We use industry-standard security measures including HTTPS encryption, secure
          authentication tokens, and Google Cloud's security infrastructure. However, no system
          is 100% secure, and we cannot guarantee absolute security.
        </p>
      ),
    },
    {
      heading: '6. Your Rights',
      body: (
        <>
          <p>You have the right to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Access your stored data (songs, templates, account info).</li>
            <li>Delete your songs, templates, and uploaded backgrounds at any time.</li>
            <li>Request complete account deletion by contacting us.</li>
            <li>Export your data in standard formats (.pptx files).</li>
          </ul>
        </>
      ),
    },
    {
      heading: "7. Children's Privacy",
      body: (
        <p>
          The Service is not directed at children under 13. We do not knowingly collect personal
          information from children.
        </p>
      ),
    },
    {
      heading: '8. Changes to This Policy',
      body: (
        <p>
          We may update this Privacy Policy from time to time. Changes will be posted on this page
          with an updated "Last updated" date.
        </p>
      ),
    },
  ],
};

const PRIVACY_ZH: PrivacyContent = {
  title: '隐私政策',
  lastUpdated: '最后更新：2026 年 4 月 12 日',
  sections: [
    {
      heading: '1. 我们收集的信息',
      body: (
        <>
          <h3 className="text-base font-medium text-slate-200">账户信息</h3>
          <p>
            当您通过 Google OAuth 登录时，我们会收到您的姓名、电子邮件地址及头像。
            这些信息仅用于身份验证，以及识别您保存的歌曲与模板。
          </p>
          <h3 className="text-base font-medium text-slate-200">用户提供的内容</h3>
          <p>
            您在使用本服务时提供的歌词、歌曲名称、作曲人信息与上传的图片。
            这些内容仅用于生成演示文件，除下文所述情形外，不会与第三方共享。
          </p>
          <h3 className="text-base font-medium text-slate-200">自动收集的数据</h3>
          <p>
            用于运维目的的基础服务器日志（IP 地址、请求时间戳等）。
            本服务不使用追踪 Cookie 或分析服务。
          </p>
        </>
      ),
    },
    {
      heading: '2. 我们如何使用您的信息',
      body: (
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong className="text-white">身份验证</strong> — 用于核实身份并管理您的账户。
          </li>
          <li>
            <strong className="text-white">服务交付</strong> — 用于生成 PPT 文件、翻译歌词、
            处理上传图片。
          </li>
          <li>
            <strong className="text-white">诗歌库</strong> — 保存与检索您的歌曲与模板供以后使用。
          </li>
        </ul>
      ),
    },
    {
      heading: '3. 第三方服务',
      body: (
        <>
          <p>本服务在处理您的内容时使用以下第三方服务：</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong className="text-white">Google Gemini API</strong> — 用于歌词翻译与乐谱 OCR。
              您为此类功能提交的文字与图片会发送至 Google API。详见{' '}
              <a
                href="https://ai.google.dev/terms"
                className="text-gold-400 hover:text-gold-300"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google AI 条款
              </a>
              。
            </li>
            <li>
              <strong className="text-white">YouTube（通过 youtube-transcript-api）</strong> —
              用于抓取公开的字幕轨道，不会访问任何 YouTube 账户数据。
            </li>
            <li>
              <strong className="text-white">Google Cloud Platform</strong> — 生产环境的托管、
              数据库及密钥管理。详见{' '}
              <a
                href="https://cloud.google.com/terms"
                className="text-gold-400 hover:text-gold-300"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Cloud 条款
              </a>
              。
            </li>
          </ul>
        </>
      ),
    },
    {
      heading: '4. 数据保留',
      body: (
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong className="text-white">生成的 PPT 文件</strong> —
            在 1 小时后自动删除。
          </li>
          <li>
            <strong className="text-white">上传的图片（乐谱、背景图）</strong> —
            临时上传会在 1 小时后删除。您添加到个人库的自定义背景会保留至您主动删除为止。
          </li>
          <li>
            <strong className="text-white">保存的歌曲与模板</strong> —
            保留至您主动删除或请求注销账户为止。
          </li>
          <li>
            <strong className="text-white">账户数据</strong> —
            在您的账户存续期间持续保留；如需删除，请联系我们。
          </li>
        </ul>
      ),
    },
    {
      heading: '5. 数据安全',
      body: (
        <p>
          我们采用行业标准的安全措施，包括 HTTPS 加密、安全身份认证令牌，
          以及 Google Cloud 的安全基础设施。但没有任何系统可以做到 100% 安全，
          我们无法保证绝对的安全性。
        </p>
      ),
    },
    {
      heading: '6. 您的权利',
      body: (
        <>
          <p>您有权：</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>访问您已存储的数据（歌曲、模板、账户信息）。</li>
            <li>随时删除您的歌曲、模板和上传的背景图。</li>
            <li>联系我们请求完整注销账户。</li>
            <li>以标准格式（.pptx）导出数据。</li>
          </ul>
        </>
      ),
    },
    {
      heading: '7. 儿童隐私',
      body: (
        <p>
          本服务不面向 13 岁以下儿童。我们不会在知情的情况下收集儿童的个人信息。
        </p>
      ),
    },
    {
      heading: '8. 本政策的变更',
      body: (
        <p>
          我们可能会不时更新本隐私政策，更新后的版本将连同新的"最后更新"日期一起
          发布在本页面上。
        </p>
      ),
    },
  ],
};

const CONTENT: Record<UILanguage, PrivacyContent> = { zh: PRIVACY_ZH, en: PRIVACY_EN };

export default function PrivacyPage() {
  const [uiLanguage] = useUILanguage();
  const content = CONTENT[uiLanguage];
  return (
    <div className="max-w-3xl mx-auto space-y-8 text-slate-300 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold text-white">{content.title}</h1>
      <p className="text-slate-400">{content.lastUpdated}</p>
      {content.sections.map((section, i) => (
        <section key={i} className="space-y-3">
          <h2 className="text-lg font-semibold text-white">{section.heading}</h2>
          {section.body}
        </section>
      ))}
    </div>
  );
}
