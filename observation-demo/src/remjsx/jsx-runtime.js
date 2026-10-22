// remjsx/jsx-runtime.js — react/jsx-runtime 别名包装（V5.30 rem 缩放）：style 属性统一过 remStyle。
// 注意：react 18.3 exports 映射仅放行 'react/jsx-runtime'（已被 alias 指向本文件，直接引会成环），
// 故经相对路径引真实运行时（node_modules 子路径不受包 exports 限制、亦不命中 bare-specifier alias）；
// 构建（production）走本文件，开发走 jsx-dev-runtime.js。
import { Fragment, jsx as _jsx, jsxs as _jsxs } from '../../node_modules/react/jsx-runtime.js';
import { remStyleFor, remSvgAttrs } from './convert.js';
const wrap = (f) => (type, props, key) => {
  if (!props) return f(type, props, key);
  let p = props;
  if (p.style) p = { ...p, style: remStyleFor(type, p.style) };
  if (type === 'svg' && (p.width != null || p.height != null)) p = remSvgAttrs(type, p);
  return p === props ? f(type, props, key) : f(type, p, key);
};
export const jsx = wrap(_jsx);
export const jsxs = wrap(_jsxs);
export { Fragment };
