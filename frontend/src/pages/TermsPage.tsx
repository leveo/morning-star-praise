// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Leo Song
import type { ReactNode } from 'react';
import { useUILanguage, type UILanguage } from '../hooks/useLanguage';

type Section = {
  heading: string;
  body: ReactNode;
};

type TermsContent = {
  title: string;
  lastUpdated: string;
  sections: Section[];
};

const TERMS_EN: TermsContent = {
  title: 'Terms of Use',
  lastUpdated: 'Last updated: April 12, 2026',
  sections: [
    {
      heading: '1. Service Description',
      body: (
        <p>
          晨星赞美 · Morning Star Praise ("the Service") is an automated workflow platform that
          instantly transforms lyrics, sheet music, and web resources into multilingual worship
          presentations and videos. The Service provides lyrics formatting, background image
          management, language conversion, translation assistance, and audio-aligned video rendering.
        </p>
      ),
    },
    {
      heading: '2. User Responsibilities & Copyright Compliance',
      body: (
        <>
          <p>
            <strong className="text-white">
              Users are solely responsible for ensuring they have the legal right to use any
              song lyrics entered into the Service.
            </strong>{' '}
            This includes but is not limited to:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong className="text-white">Obtaining proper licenses</strong> — Most worship
              songs are protected by copyright. Users must obtain appropriate licenses
              (e.g., CCLI, ONE LICENSE, or direct permission from copyright holders) before
              reproducing lyrics in any form, including presentation slides.
            </li>
            <li>
              <strong className="text-white">Public domain verification</strong> — Some classic
              hymns are in the public domain, but specific arrangements or translations may still
              be copyrighted. Users should verify the copyright status of each song they use.
            </li>
            <li>
              <strong className="text-white">Fair use limitations</strong> — The Service does not
              make any determination about fair use. Users should consult legal counsel if unsure
              about their rights.
            </li>
          </ul>
        </>
      ),
    },
    {
      heading: '3. How the Service Handles Content',
      body: (
        <ul className="list-disc pl-6 space-y-2">
          <li>
            The Service does <strong className="text-white">not</strong> store, host, or distribute
            any copyrighted song lyrics in its database or servers beyond the immediate session
            processing.
          </li>
          <li>
            Lyrics are provided entirely by the user (typed, pasted, or extracted from
            user-provided sources). The Service does not include a built-in lyrics database.
          </li>
          <li>
            YouTube subtitle extraction retrieves only publicly available subtitle tracks provided
            by video uploaders or YouTube's auto-generation system.
          </li>
          <li>
            AI-powered translation is provided as an assistive tool. Translations of copyrighted
            songs may themselves be subject to copyright restrictions. Users should verify with
            the rights holder.
          </li>
          <li>
            Generated .pptx files are created on-demand and automatically deleted after 1 hour.
            The Service does not retain copies.
          </li>
        </ul>
      ),
    },
    {
      heading: '4. Recommended Licensing',
      body: (
        <>
          <p>
            We strongly recommend that churches and worship teams obtain one or more of the
            following licenses:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong className="text-white">CCLI (Christian Copyright Licensing International)</strong>{' '}
              — Covers most contemporary worship songs for congregational use and projection.
            </li>
            <li>
              <strong className="text-white">ONE LICENSE</strong> — Covers many Catholic and
              traditional hymnal publishers.
            </li>
            <li>
              <strong className="text-white">CCS (Christian Copyright Solutions) / PraiseCharts</strong>{' '}
              — Additional coverage for specific catalogs.
            </li>
          </ul>
          <p>
            Having an active CCLI license typically permits projecting lyrics during worship
            services, which is the primary intended use of this Service.
          </p>
        </>
      ),
    },
    {
      heading: '5. Disclaimer of Liability',
      body: (
        <>
          <p>
            The Service is provided "as is" without warranty of any kind. The operators of this
            Service:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Do not guarantee the accuracy of AI translations or OCR extractions.</li>
            <li>Are not responsible for any copyright infringement by users of the Service.</li>
            <li>Do not provide legal advice regarding copyright, licensing, or fair use.</li>
            <li>Reserve the right to modify or discontinue the Service at any time.</li>
          </ul>
        </>
      ),
    },
    {
      heading: '6. Acceptable Use',
      body: (
        <>
          <p>The Service is intended solely for:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Creating worship presentation slides for church services and gatherings.</li>
            <li>Personal study and practice of worship songs.</li>
          </ul>
          <p>
            The Service must <strong className="text-white">not</strong> be used for:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Commercial redistribution of generated slides or lyrics.</li>
            <li>Building a lyrics database or scraping copyrighted content at scale.</li>
            <li>Any purpose that violates applicable copyright laws.</li>
          </ul>
        </>
      ),
    },
    {
      heading: '7. DMCA / Takedown',
      body: (
        <p>
          If you are a copyright holder and believe the Service is being used to infringe your
          rights, please contact us. We will promptly address any valid concerns.
        </p>
      ),
    },
  ],
};

const TERMS_ZH: TermsContent = {
  title: '服务条款',
  lastUpdated: '最后更新：2026 年 4 月 12 日',
  sections: [
    {
      heading: '1. 服务描述',
      body: (
        <p>
          晨星赞美 · Morning Star Praise（以下简称"本服务"）是一个自动化工作流平台，
          可一键将歌词、乐谱和网络资源转化为多语种敬拜 PPT 与展示视频。本服务提供
          歌词分版、背景图管理、中英文简繁转换、翻译辅助以及基于音频对齐的视频渲染功能。
        </p>
      ),
    },
    {
      heading: '2. 用户责任与版权合规',
      body: (
        <>
          <p>
            <strong className="text-white">
              用户须自行确保对输入本服务的任何歌曲歌词拥有合法使用权。
            </strong>
            这包括但不限于：
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong className="text-white">取得合法授权</strong>{' '}
              — 绝大多数敬拜诗歌受版权保护。用户须在以任何形式（包括 PPT 投影）复制歌词之前，
              取得相应的授权（例如 CCLI、ONE LICENSE 或版权方的直接许可）。
            </li>
            <li>
              <strong className="text-white">公有领域核实</strong>{' '}
              — 部分古典圣诗属于公有领域，但特定的改编或译本可能仍受版权保护。
              用户应当自行核实所使用每一首歌的版权状态。
            </li>
            <li>
              <strong className="text-white">合理使用限制</strong>{' '}
              — 本服务不对"合理使用"作任何判定。如有疑问，用户应咨询专业法律意见。
            </li>
          </ul>
        </>
      ),
    },
    {
      heading: '3. 本服务如何处理内容',
      body: (
        <ul className="list-disc pl-6 space-y-2">
          <li>
            除会话处理所需的即时操作外，本服务<strong className="text-white">不</strong>
            在数据库或服务器上存储、托管或分发任何受版权保护的歌曲歌词。
          </li>
          <li>
            歌词内容完全由用户提供（输入、粘贴或从用户提供的来源中提取），
            本服务不内置歌词数据库。
          </li>
          <li>
            YouTube 字幕抓取仅获取视频上传者或 YouTube 自动生成系统提供的公开字幕。
          </li>
          <li>
            AI 翻译仅作为辅助工具提供。受版权保护的歌曲的翻译本身也可能受版权限制，
            请与版权方核实。
          </li>
          <li>
            生成的 .pptx 文件按需创建，并在 1 小时后自动删除，本服务不保留副本。
          </li>
        </ul>
      ),
    },
    {
      heading: '4. 推荐的授权方式',
      body: (
        <>
          <p>我们强烈建议教会和敬拜团队取得以下一项或多项授权：</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong className="text-white">CCLI（Christian Copyright Licensing International）</strong>{' '}
              — 涵盖大多数现代敬拜诗歌的会众使用与投影。
            </li>
            <li>
              <strong className="text-white">ONE LICENSE</strong> — 涵盖许多天主教以及传统圣诗出版者。
            </li>
            <li>
              <strong className="text-white">CCS (Christian Copyright Solutions) / PraiseCharts</strong>{' '}
              — 提供对特定曲库的补充授权。
            </li>
          </ul>
          <p>
            持有有效的 CCLI 授权通常允许在敬拜聚会中投影歌词，这也是本服务的主要使用场景。
          </p>
        </>
      ),
    },
    {
      heading: '5. 免责声明',
      body: (
        <>
          <p>本服务按"现状"提供，不附带任何形式的担保。本服务运营方：</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>不保证 AI 翻译或 OCR 提取结果的准确性。</li>
            <li>不对用户因使用本服务而产生的任何版权侵权行为承担责任。</li>
            <li>不就版权、授权或合理使用提供法律意见。</li>
            <li>保留随时修改或终止本服务的权利。</li>
          </ul>
        </>
      ),
    },
    {
      heading: '6. 可接受的使用',
      body: (
        <>
          <p>本服务仅供以下用途：</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>为教会聚会与崇拜制作敬拜 PPT 投影。</li>
            <li>个人学习与练习敬拜诗歌。</li>
          </ul>
          <p>
            <strong className="text-white">不得</strong>将本服务用于：
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>对生成的 PPT 或歌词进行商业性再发行。</li>
            <li>构建歌词数据库或大规模抓取受版权保护的内容。</li>
            <li>任何违反适用版权法的用途。</li>
          </ul>
        </>
      ),
    },
    {
      heading: '7. DMCA / 下架通知',
      body: (
        <p>
          若您是版权持有人，并认为本服务被用于侵犯您的权利，请与我们联系，
          我们会尽快处理合理的诉求。
        </p>
      ),
    },
  ],
};

const CONTENT: Record<UILanguage, TermsContent> = { zh: TERMS_ZH, en: TERMS_EN };

export default function TermsPage() {
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
