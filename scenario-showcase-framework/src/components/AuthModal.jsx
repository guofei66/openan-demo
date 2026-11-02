// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** AuthModal — configuration-change authorization dialog.
 *
 *  Any bank/script message carrying `auth.required` freezes the interaction
 *  driver (pause) and opens this modal. The user either approves (the change
 *  is authorized and the flow resumes) or rejects (the flow continues with
 *  the current network configuration kept — demo semantics). The decision is
 *  stamped back onto the message as a footer badge in the conversation.
 *
 *  Payload schema (message.auth):
 *      { required: true,
 *        source: '业务保障智能体',
 *        via?: {zh, en},                  // e.g. A2A-T 协商裁定
 *        title: {zh, en},
 *        changes: [{ label: {zh,en}, from: {zh,en}, to: {zh,en} }] }
 */
import { ShieldAlert, ShieldCheck, ArrowRight } from 'lucide-react';

const AuthModal = ({ m, onDecide, tr, pick }) => {
    const auth = m.auth || {};
    const changes = auth.changes || [];
    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-zinc-950/70 backdrop-blur-sm" />
            <div className="relative w-[500px] max-w-[94vw] rounded-2xl border border-amber-500/40 bg-zinc-900 shadow-2xl ring-1 ring-white/5 overflow-hidden ss-fade-up">
                <div className="px-5 py-3 flex items-center gap-2.5 border-b border-zinc-800 bg-amber-500/[0.07]">
                    <ShieldAlert size={18} className="text-amber-400 shrink-0" />
                    <span className="text-[14px] font-bold text-zinc-100">
                        {tr('ss.auth.title', '配置变更授权', 'Configuration Change Authorization')}
                    </span>
                    {auth.source && (
                        <span className="ml-auto px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700 shrink-0 truncate max-w-[180px]">
                            {auth.source}
                        </span>
                    )}
                </div>
                <div className="px-5 py-4 space-y-3.5">
                    <div className="text-[14px] font-bold text-zinc-100 leading-snug">{pick(auth.title)}</div>
                    {auth.via && (
                        <div className="text-[12px] font-semibold text-violet-300">{pick(auth.via)}</div>
                    )}
                    {changes.length > 0 && (
                        <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800/80 overflow-hidden">
                            {changes.map((c, i) => (
                                <div key={i} className="px-3.5 py-2.5 flex items-center gap-2.5 flex-wrap bg-zinc-950/40">
                                    <span className="text-[12px] font-semibold text-zinc-300 min-w-[130px]">{pick(c.label)}</span>
                                    <span className="text-[12px] text-zinc-500">{pick(c.from)}</span>
                                    <ArrowRight size={13} className="text-zinc-600 shrink-0" />
                                    <span className="text-[12px] font-bold text-emerald-400">{pick(c.to)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="text-[12px] leading-relaxed text-zinc-400 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
                        {pick(m.text)}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                        {tr('ss.auth.note', '授权后执行流程自动继续；拒绝则维持现网配置（演示）。', 'The flow resumes automatically after approval; rejection keeps the current configuration (demo).')}
                    </div>
                </div>
                <div className="px-5 py-3.5 border-t border-zinc-800 flex items-center justify-end gap-2.5 bg-zinc-950/40">
                    <button
                        type="button"
                        onClick={() => onDecide('rejected')}
                        className="px-4 py-1.5 rounded-lg text-[13px] font-semibold border border-rose-500/60 text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                        {tr('ss.auth.reject', '拒绝', 'Reject')}
                    </button>
                    <button
                        type="button"
                        onClick={() => onDecide('approved')}
                        className="px-4 py-1.5 rounded-lg text-[13px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 transition-colors inline-flex items-center gap-1.5"
                    >
                        <ShieldCheck size={15} />
                        {tr('ss.auth.approve', '同意授权', 'Approve')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AuthModal;
