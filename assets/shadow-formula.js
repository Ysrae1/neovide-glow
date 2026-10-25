// User-editable shadow math. This module never executes JavaScript source.
import { FIELD_PRESET } from './field-preset.js?v=shadow-20261026';
export const DEFAULT_FORMULA = FIELD_PRESET.textShadowFormula;
// Optional visual heuristic; d is chromatic OKLab distance, not a WCAG metric.
export const COLOR_FORMULA = '0.6 * (1 - smoothstep(1.2, 4.5, c)) * (1 - smoothstep(0.03, 0.15, d))';

const MAX_SOURCE = 1024, MAX_TOKENS = 512, MAX_DEPTH = 32;
const constants = Object.freeze({pi:Math.PI, e:Math.E});
const functions = Object.freeze({min:2,max:2,pow:2,abs:1,sqrt:1,exp:1,log:1,clamp:3,smoothstep:3});
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const finite = value => {
  if (!Number.isFinite(value)) throw new RangeError('公式产生了非有限值');
  return value;
};

export function clampAlpha(value) {
  return Math.max(0, Math.min(1, finite(value)));
}

function tokenize(source) {
  if (typeof source !== 'string' || !source.trim()) throw new SyntaxError('请输入公式');
  if (source.length > MAX_SOURCE) throw new SyntaxError('公式过长');
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const whitespace = /^\s+/.exec(rest);
    if (whitespace) { index += whitespace[0].length; continue; }
    let match;
    if ((match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest))) {
      const value = Number(match[0]);
      if (!Number.isFinite(value)) throw new SyntaxError('数字超出范围');
      tokens.push({type:'number',value,raw:match[0]});
    } else if ((match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) {
      tokens.push({type:'name',value:match[0]});
    } else if ('+-*/^(),'.includes(rest[0])) {
      match = [rest[0]];
      tokens.push({type:rest[0]});
    } else {
      throw new SyntaxError(`公式包含不支持的字符（第 ${index + 1} 位）`);
    }
    index += match[0].length;
    if (tokens.length > MAX_TOKENS) throw new SyntaxError('公式过于复杂');
  }
  tokens.push({type:'end'});
  return tokens;
}

function parse(source) {
  const tokens = tokenize(source);
  let position = 0;
  const peek = () => tokens[position];
  const take = type => {
    if (peek().type !== type) throw new SyntaxError(`公式缺少 ${type}`);
    return tokens[position++];
  };
  const precedence = {'+':10,'-':10,'*':20,'/':20,'^':40};
  function expression(minimum = 0, depth = 0) {
    if (depth > MAX_DEPTH) throw new SyntaxError('公式嵌套过深');
    let node;
    const token = tokens[position++];
    if (token.type === 'number') node = {kind:'number',value:token.value,raw:token.raw};
    else if (token.type === '+' || token.type === '-') {
      // Power binds more tightly than unary minus: -2^2 = -(2^2).
      node = {kind:'unary',operator:token.type,arg:expression(30,depth+1)};
    } else if (token.type === '(') {
      node = expression(0,depth+1); take(')');
    } else if (token.type === 'name') {
      const name = token.value;
      if (name === 'c' || name === 'd') node = {kind:'variable',name};
      else if (own(constants,name)) node = {kind:'constant',name};
      else if (own(functions,name)) {
        take('(');
        const args = [];
        if (peek().type !== ')') {
          args.push(expression(0,depth+1));
          while (peek().type === ',') {
            take(',');
            args.push(expression(0,depth+1));
            if (args.length > functions[name]) throw new SyntaxError(`${name} 参数数量不正确`);
          }
        }
        take(')');
        if (args.length !== functions[name]) throw new SyntaxError(`${name} 需要 ${functions[name]} 个参数`);
        node = {kind:'call',name,args};
      } else throw new SyntaxError(`未知名称：${name}`);
    } else throw new SyntaxError('公式缺少数字、变量或函数');
    while (own(precedence,peek().type) && precedence[peek().type] >= minimum) {
      const operator = tokens[position++].type, level = precedence[operator];
      const right = expression(operator === '^' ? level : level+1, depth+1);
      node = {kind:'binary',operator,left:node,right};
    }
    return node;
  }
  const ast = expression();
  if (peek().type !== 'end') throw new SyntaxError('公式存在多余内容或缺少运算符');
  // A long left-associative chain has shallow parsing but a deep AST.
  function checkDepth(node,depth=0) {
    if (depth > MAX_DEPTH) throw new SyntaxError('公式运算层数过多');
    if (node.kind === 'binary') { checkDepth(node.left,depth+1);checkDepth(node.right,depth+1); }
    else if (node.kind === 'unary') checkDepth(node.arg,depth+1);
    else if (node.kind === 'call') node.args.forEach(arg=>checkDepth(arg,depth+1));
  }
  checkDepth(ast);
  return ast;
}

function calculate(node,c,d) {
  let value;
  if (node.kind === 'number') return node.value;
  if (node.kind === 'variable') return node.name === 'c' ? c : d;
  if (node.kind === 'constant') return constants[node.name];
  if (node.kind === 'unary') {
    const arg = calculate(node.arg,c,d);
    value = node.operator === '-' ? -arg : arg;
  } else if (node.kind === 'binary') {
    const a = calculate(node.left,c,d), b = calculate(node.right,c,d);
    switch (node.operator) {
      case '+': value=a+b;break;
      case '-': value=a-b;break;
      case '*': value=a*b;break;
      case '/': value=a/b;break;
      case '^': value=a**b;break;
    }
  } else {
    const args = node.args.map(arg=>calculate(arg,c,d));
    const [a,b,x] = args;
    if (node.name === 'clamp') {
      if (b > x) throw new RangeError('clamp 的下限不能大于上限');
      value = Math.max(b,Math.min(x,a));
    } else if (node.name === 'smoothstep') {
      if (!(b > a)) throw new RangeError('smoothstep 的上限必须大于下限');
      const t = Math.max(0,Math.min(1,(x-a)/(b-a)));
      value = t*t*(3-2*t);
    } else value = Math[node.name](...args);
  }
  return finite(value);
}

function toTex(node) {
  const wrap = value => `\\left(${value}\\right)`;
  const grouped = arg => ['binary','unary'].includes(arg.kind) ? wrap(toTex(arg)) : toTex(arg);
  if (node.kind === 'number') {
    const parts=node.raw.split(/[eE]/);
    return parts.length === 2 ? `${parts[0]}\\times 10^{${Number(parts[1])}}` : node.raw;
  }
  if (node.kind === 'variable') return node.name;
  if (node.kind === 'constant') return node.name === 'pi' ? '\\pi' : '\\mathrm{e}';
  if (node.kind === 'unary') return `${node.operator}${grouped(node.arg)}`;
  if (node.kind === 'binary') {
    const a=toTex(node.left),b=toTex(node.right);
    if (node.operator === '/') return `\\frac{${a}}{${b}}`;
    if (node.operator === '^') return `{${grouped(node.left)}}^{${b}}`;
    if (node.operator === '*') return `${grouped(node.left)}\\,\\cdot\\,${grouped(node.right)}`;
    return `${grouped(node.left)} ${node.operator} ${grouped(node.right)}`;
  }
  const args=node.args.map(toTex);
  if (node.name === 'sqrt') return `\\sqrt{${args[0]}}`;
  if (node.name === 'abs') return `\\left|${args[0]}\\right|`;
  if (node.name === 'pow') return `{${grouped(node.args[0])}}^{${args[1]}}`;
  if (node.name === 'exp') return `\\mathrm{e}^{${args[0]}}`;
  return `\\operatorname{${node.name}}${wrap(args.join(',\\,'))}`;
}

export function compileFormula(source) {
  const ast=parse(source);
  return Object.freeze({
    evaluate(c,d) { return finite(calculate(ast,finite(c),finite(d))); },
    tex:toTex(ast)
  });
}

export function validateFormula(source) {
  const compiled=compileFormula(source);
  // A finite grid catches common domain errors; every runtime evaluation also
  // checks finiteness because sampling cannot prove a continuous domain safe.
  for (let ci=0;ci<=80;ci++) for (let di=0;di<=28;di++) {
    compiled.evaluate(1+ci*.25,di*.025);
  }
  return compiled;
}

function linearRGB(rgb) {
  if (!rgb || rgb.length !== 3) throw new TypeError('颜色需要三个 RGB 通道');
  return Array.from(rgb,value=>{
    finite(value);
    if (value<0 || value>255) throw new RangeError('RGB 通道应在 0–255 之间');
    const c=value/255;
    return c<=.04045 ? c/12.92 : ((c+.055)/1.055)**2.4;
  });
}
function chromaticLab([r,g,b]) {
  // Björn Ottosson's 2021 linear-sRGB → OKLab matrices (public domain).
  // https://bottosson.github.io/posts/oklab/#converting-from-linear-srgb-to-oklab
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b);
  const m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b);
  const s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return [1.9779984951*l-2.4285922050*m+.4505937099*s,
    .0259040371*l+.7827717662*m-.8086757660*s];
}
export function colorInputs(foregroundRGB255,backgroundRGB255) {
  const foreground=linearRGB(foregroundRGB255),background=linearRGB(backgroundRGB255);
  const luminance=rgb=>.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  const a=luminance(foreground),b=luminance(background);
  const first=chromaticLab(foreground),second=chromaticLab(background);
  return {c:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),
    d:Math.hypot(first[0]-second[0],first[1]-second[1])};
}
