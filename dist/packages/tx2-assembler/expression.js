/** Bounded, non-evaluating integer expression parser; all numeric values are BigInt. */
export class ExpressionError extends Error {
    constructor(message, column = 1) { super(message); this.column = column; }
}
export function tokenizeExpression(source) {
    const tokens = [];
    let p = 0;
    while (p < source.length) {
        if (/\s/.test(source[p])) {
            p++;
            continue;
        }
        const start = p, rest = source.slice(p);
        let m;
        if ((m = /^(?:0[oO][0-7][0-7_]*|0[xX][\da-fA-F][\da-fA-F_]*|0[bB][01][01_]*|0[dD]\d[\d_]*|\d[\d_]*)/.exec(rest))) {
            tokens.push({ type: 'number', value: m[0], column: p + 1 });
            p += m[0].length;
        }
        else if ((m = /^[\p{L}_.$][\p{L}\p{N}_.$]*/u.exec(rest))) {
            tokens.push({ type: 'id', value: m[0], column: p + 1 });
            p += m[0].length;
        }
        else if (source[p] === '#') {
            tokens.push({ type: 'here', value: '#', column: ++p });
        }
        else if ((m = /^(<<|>>|[()+\-*\/%&|^~])/.exec(rest))) {
            tokens.push({ type: 'op', value: m[0], column: p + 1 });
            p += m[0].length;
        }
        else
            throw new ExpressionError(`Unexpected character '${source[p]}'`, p + 1);
        if (tokens.length > 4096)
            throw new ExpressionError('Expression exceeds 4096 tokens', start + 1);
    }
    tokens.push({ type: 'end', value: '', column: p + 1 });
    return tokens;
}
const BP = { '|': 1, '^': 2, '&': 3, '<<': 4, '>>': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
export function evaluate(source, { resolve = name => { throw new ExpressionError(`Undefined symbol ${name}`); }, here = 0n } = {}) {
    const t = tokenizeExpression(source);
    let pos = 0, depth = 0;
    const number = s => {
        s = s.replaceAll('_', '');
        if (/^0d/i.test(s))
            return BigInt(s.slice(2));
        if (/^0[oxb]/i.test(s))
            return BigInt(s);
        if (!/^[0-7]+$/.test(s))
            throw new ExpressionError(`Bare integers are octal: '${s}'. Use 0d${s} for decimal.`);
        return BigInt('0o' + s);
    };
    function expr(min = 0) {
        if (++depth > 128)
            throw new ExpressionError('Expression nesting exceeds 128');
        let item = t[pos++], left;
        if (item.type === 'number')
            left = number(item.value);
        else if (item.type === 'here')
            left = BigInt(here);
        else if (item.type === 'id')
            left = BigInt(resolve(item.value));
        else if (item.value === '(') {
            left = expr();
            if (t[pos++].value !== ')')
                throw new ExpressionError('Expected closing parenthesis', item.column);
        }
        else if (['+', '-', '~'].includes(item.value)) {
            const n = expr(7);
            left = item.value === '-' ? -n : item.value === '~' ? ~n : n;
        }
        else
            throw new ExpressionError('Expected integer, symbol, or parenthesized expression', item.column);
        while (t[pos].type === 'op' && BP[t[pos].value] >= min) {
            const op = t[pos++].value, b = expr(BP[op] + 1);
            switch (op) {
                case '+':
                    left += b;
                    break;
                case '-':
                    left -= b;
                    break;
                case '*':
                    left *= b;
                    break;
                case '/':
                    if (!b)
                        throw new ExpressionError('Division by zero');
                    left /= b;
                    break;
                case '%':
                    if (!b)
                        throw new ExpressionError('Division by zero');
                    left %= b;
                    break;
                case '&':
                    left &= b;
                    break;
                case '|':
                    left |= b;
                    break;
                case '^':
                    left ^= b;
                    break;
                case '<<':
                case '>>':
                    if (b < 0n || b > 4096n)
                        throw new ExpressionError('Shift count must be 0..4096');
                    left = op === '<<' ? left << b : left >> b;
                    break;
            }
            if (left.toString(2).length > 8192)
                throw new ExpressionError('Expression integer exceeds 8192 bits');
        }
        depth--;
        return left;
    }
    const result = expr();
    if (t[pos].type !== 'end')
        throw new ExpressionError(`Unexpected '${t[pos].value}'`, t[pos].column);
    return result;
}
