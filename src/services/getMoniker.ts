/* @internal */

namespace ts.GetMoniker {
    import * as crypto from 'crypto';

    export function GetMonikerAtPosition(program: Program, sourceFile: SourceFile, position: number): string | undefined {
        const typeChecker = program.getTypeChecker();
        const node = getTouchingPropertyName(sourceFile, position);
        if (node === sourceFile) {
            return undefined;
        }
        const symbol = typeChecker.getSymbolAtLocation(node);
        if (symbol === undefined) {
            return undefined;
        }
        const moniker = createKey(typeChecker, symbol);
        return moniker;
    }

    const Unknown = 'unkown';
    const Undefined = 'undefined';
    const None = 'none';

    interface InternalSymbol extends ts.Symbol {
        parent?: ts.Symbol;
        containingType?: ts.UnionOrIntersectionType;
        __symbol__data__key__: string | undefined;
    }

    function createKey(typeChecker: TypeChecker, symbol: Symbol): string | undefined {
        let result: string | undefined = (symbol as InternalSymbol).__symbol__data__key__;
        if (result !== undefined) {
            return result;
        }
        let declarations = symbol.getDeclarations();
        if (declarations === undefined) {
            if (typeChecker.isUnknownSymbol(symbol)) {
                return Unknown;
            } else if (typeChecker.isUndefinedSymbol(symbol)) {
                return Undefined;
            } else {
                return None;
            }
        }
        let fragments: { f: string; s: number; e: number; k: number }[] = [];
        for (let declaration of declarations) {
            fragments.push({
                f: declaration.getSourceFile().fileName,
                s: declaration.getStart(),
                e: declaration.getEnd(),
                k: declaration.kind
            });
        }
        if (fragments.length > 1) {
            fragments.sort((a, b) => {
                let result = a.f < b.f ? -1 : (a.f > b.f ? 1 : 0);
                if (result !== 0) {
                    return result;
                }
                result = a.s - b.s;
                if (result !== 0) {
                    return result;
                }
                result = a.e - b.e;
                if (result !== 0) {
                    return result;
                }
                return a.k - b.k;
            });
        }
        let hash = crypto.createHash('md5');
        if ((symbol.flags & ts.SymbolFlags.Transient) !== 0) {
            hash.update(JSON.stringify({ trans: true }, undefined, 0));
        }
        hash.update(JSON.stringify(fragments, undefined, 0));
        result = hash.digest('base64');
        (symbol as InternalSymbol).__symbol__data__key__ = result;
        return result;
    }
}



