// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Leo Song
import { useUILanguage } from '../hooks/useLanguage';

const BODY_ZH = [
  '这个晨星赞美的工作流平台是为了帮助所有对于制作诗歌赞美 PPT 有需求，或者制作福音主题视频的弟兄姊妹使用，目的是为了帮助大家节省时间，降低剪辑视频的操作门槛。',
  '如果大家使用的诗歌是有正版官方 PPT 或者有正版的视频购买途径，请大家优先使用官方途径。',
  '这个项目需要保持开源。',
];

const BODY_EN = [
  'Morning Star Praise is a workflow platform for brothers and sisters who need to produce worship-song PPTs or gospel-themed videos. Its purpose is to save time and lower the bar for video editing.',
  'If the hymn you use already has an official PPT or a legitimate video distribution channel, please prefer the official source.',
  'This project is committed to staying open source.',
];

const LICENSE_HEADING_ZH = '许可协议';
const LICENSE_HEADING_EN = 'License';

const LICENSE_ZH = [
  '本项目采用知识共享协议：',
  'Creative Commons - NonCommercial (CC BY-NC, 署名-非商业性使用)',
  '允许复制、发行、展示和演绎作品，但不得用于商业目的。必须注明原作者。',
];

const LICENSE_EN = [
  'This project is licensed under:',
  'Creative Commons Attribution-NonCommercial (CC BY-NC)',
  'You are free to copy, distribute, display and adapt the work, but not for commercial purposes. Attribution to the original author is required.',
];

export default function AboutPage() {
  const [uiLanguage] = useUILanguage();
  const heading = uiLanguage === 'zh' ? '关于我们' : 'About';
  const body = uiLanguage === 'zh' ? BODY_ZH : BODY_EN;
  const licenseHeading = uiLanguage === 'zh' ? LICENSE_HEADING_ZH : LICENSE_HEADING_EN;
  const license = uiLanguage === 'zh' ? LICENSE_ZH : LICENSE_EN;

  return (
    <div className="max-w-2xl space-y-6 text-slate-200 leading-relaxed">
      <h2 className="text-lg font-semibold text-white">{heading}</h2>

      <div className="space-y-3 text-sm">
        {body.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-2 text-sm">
        <h3 className="text-sm font-medium text-white">{licenseHeading}</h3>
        {license.map((line, i) => (
          <p key={i} className={i === 1 ? 'font-mono text-amber-300 text-[13px]' : 'text-slate-300'}>
            {line}
          </p>
        ))}
        <p className="text-xs text-slate-500 pt-2">
          <a
            href="https://creativecommons.org/licenses/by-nc/4.0/"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-slate-300"
          >
            creativecommons.org/licenses/by-nc/4.0
          </a>
        </p>
      </div>
    </div>
  );
}
