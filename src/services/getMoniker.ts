/* @internal */

namespace ts.GetMoniker {
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

		const declarationSourceFiles: ts.SourceFile[] | undefined = Utilities.getDeclarationSourceFiles(symbol);
		const moduleSystem = Utilities.getModuleSystemKind(declarationSourceFiles, typeChecker);
		const exportPath = Symbols.getExportPath(symbol, moduleSystem, typeChecker);

		const monikerIdentifer = Utilities.getMonikerIdentifier(Symbols.isSourceFile(symbol), moduleSystem, exportPath);
        return monikerIdentifer;
    }


    interface InternalSymbol extends ts.Symbol {
        parent?: ts.Symbol;
        containingType?: ts.UnionOrIntersectionType;
        __symbol__data__key__: string | undefined;
    }

	enum ModuleSystemKind {
		unknown = 1,
		module = 2,
		global = 3
	}

	class Utilities {
		public static getDeclarationSourceFiles(symbol: ts.Symbol): ts.SourceFile[]  | undefined {
			let sourceFiles = TypeScriptSymbol.getUniqueSourceFiles(symbol.getDeclarations());
			if (sourceFiles.size === 0) {
				return [];
			}
			return arrayFrom(sourceFiles.values());
		}
	
		public static getModuleSystemKind(sourceFiles: ts.SourceFile[] | undefined, typeChecker: ts.TypeChecker): ModuleSystemKind {
			if (sourceFiles === undefined || sourceFiles.length === 0) {
				return ModuleSystemKind.unknown;
			}
			let moduleCount: number = 0;
			let globalCount: number = 0;
			for (let sourceFile of sourceFiles) {
				// files that represent a module do have a resolve symbol.
				if (typeChecker.getSymbolAtLocation(sourceFile) !== undefined) {
					moduleCount++;
					continue;
				}
				// Things that are global in case we need to treat them special later on
				// tss.Program.isSourceFileDefaultLibrary
				// this.sourceFilesContainingAmbientDeclarations.has(sourceFile.fileName)
				globalCount++;
	
				// tss.Program.isSourceFileFromExternalLibrary doesn't give any clear hint whether it
				// is global or module.
			}
			const numberOfFiles = sourceFiles.length;
			if (moduleCount === numberOfFiles) {
				return ModuleSystemKind.module;
			}
			if (globalCount === numberOfFiles) {
				return ModuleSystemKind.global;
			}
			return ModuleSystemKind.unknown;
		}

		public static getMonikerIdentifier(isSourceFile: boolean, moduleSystem: ModuleSystemKind | undefined, exportPath: string | undefined): string | undefined {
			let monikerIdentifer: string | undefined;
			const monikerFilePaths: Set<string> = new Set();
	
			const monikerFilePath: string | undefined = monikerFilePaths.size === 0
				? undefined
				: monikerFilePaths.size === 1
					? monikerFilePaths.values().next().value
					: `[${arrayFrom(monikerFilePaths.values()).join(',')}]`;
	
			if (isSourceFile && monikerFilePath !== undefined) {
				monikerIdentifer = createMonikerIdentifier(monikerFilePath, undefined);
			}
			if (monikerIdentifer === undefined && exportPath !== undefined) {
				if (moduleSystem === undefined || moduleSystem === ModuleSystemKind.global) {
					monikerIdentifer = createMonikerIdentifier(undefined, exportPath);
				}
				if (monikerIdentifer === undefined && monikerFilePath !== undefined) {
					monikerIdentifer = createMonikerIdentifier(monikerFilePath, exportPath);
				}
			}
			return monikerIdentifer;
		}
	}

    class Symbols {
		private static TopLevelPaths: ESMap<number, number[]> = new Map([
			[ts.SyntaxKind.VariableDeclaration, [ts.SyntaxKind.VariableDeclarationList, ts.SyntaxKind.VariableStatement, ts.SyntaxKind.SourceFile]]
		]);
	
		private static InternalSymbolNames: ESMap<string, string> = new Map([
			[ts.InternalSymbolName.Call, '1I'],
			[ts.InternalSymbolName.Constructor, '2I'],
			[ts.InternalSymbolName.New, '3I'],
			[ts.InternalSymbolName.Index, '4I'],
			[ts.InternalSymbolName.ExportStar, '5I'],
			[ts.InternalSymbolName.Global, '6I'],
			[ts.InternalSymbolName.Missing, '7I'],
			[ts.InternalSymbolName.Type, '8I'],
			[ts.InternalSymbolName.Object, '9I'],
			[ts.InternalSymbolName.JSXAttributes, '10I'],
			[ts.InternalSymbolName.Class, '11I'],
			[ts.InternalSymbolName.Function, '12I'],
			[ts.InternalSymbolName.Computed, '13I'],
			[ts.InternalSymbolName.Resolving, '14I'],
			[ts.InternalSymbolName.ExportEquals, '15I'],
			[ts.InternalSymbolName.Default, '16I'],
			[ts.InternalSymbolName.This, '17I']
		]);

        public static isSourceFile(symbol: ts.Symbol): boolean  {
            const declarations = symbol.getDeclarations();
            return declarations !== undefined && declarations.length === 1 && ts.isSourceFile(declarations[0]);
        }

        public static asParameterDeclaration(symbol: ts.Symbol): ts.ParameterDeclaration | undefined {
            const declarations = symbol.getDeclarations();
            if (declarations === undefined || declarations.length !== 1) {
                return undefined;
            }
            return ts.isParameter(declarations[0]) ? declarations[0] as ts.ParameterDeclaration : undefined;
		}
		
        public static isClass(symbol: ts.Symbol): boolean {
            return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.Class) !== 0;
        }
    
        public static isInterface(symbol: ts.Symbol): boolean {
            return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.Interface) !== 0;
        }
    
        public static isTypeLiteral(symbol: ts.Symbol): boolean {
            return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.TypeLiteral) !== 0;
        }

        public static isAliasSymbol(symbol: ts.Symbol): boolean  {
            return symbol !== undefined && (symbol.getFlags() & ts.SymbolFlags.Alias) !== 0;
        }

		public static getExportSymbolName(symbol: ts.Symbol, internalName?: string): string {
			const escapedName = symbol.getEscapedName();
			// export default foo && export = foo
			if (Symbols.isAliasSymbol(symbol) && (escapedName === ts.InternalSymbolName.Default || escapedName === ts.InternalSymbolName.ExportEquals)) {
				const declarations = symbol.getDeclarations();
				if (declarations !== undefined && declarations.length === 1) {
					const declaration = declarations[0];
					if (ts.isExportAssignment(declaration)) {
						return declaration.expression.getText();
					}
				}
			}
			const internalSymbolId: string | undefined = Symbols.InternalSymbolNames.get(escapedName as string);
			if (internalSymbolId !== undefined) {
				return internalName ?? internalSymbolId;
			}
			const name = symbol.getName();
			if (name.charAt(0) === '\"' || name.charAt(0) === '\'') {
				return name.substr(1, name.length - 2);
			}
			return name;
		}
	
		public static isTopLevelSymbol(symbol: ts.Symbol): boolean {
			const declarations: ts.Declaration[] | undefined = symbol.declarations;
			if (declarations === undefined || declarations.length === 0) {
				return false;
			}
	
			let result: boolean = false;
			for (const declaration of declarations) {
				const path: number[] | undefined = Symbols.TopLevelPaths.get(declaration.kind);
				if (path === undefined) {
					result = result || ts.isSourceFile(declaration.parent);
				} else {
					result = result || this.matchPath(declaration.parent, path);
				}
			}
			return result;
		}
		
		public static getExportPath(symbol: ts.Symbol, kind: ModuleSystemKind, typeChecker: ts.TypeChecker): string | undefined {
			let result : string | undefined;
			if (Symbols.isSourceFile(symbol) && (kind === ModuleSystemKind.module || kind === ModuleSystemKind.unknown)) {
				return '';
			}
			const parent = TypeScriptSymbol.getParent(symbol);
			const name = this.getExportSymbolName(symbol);
			if (parent === undefined) {
				// In a global module system symbol inside other namespace don't have a parent
				// if the symbol is not exported. So we need to check if the symbol is a top
				// level symbol
				if (kind === ModuleSystemKind.global) {
					if (this.isTopLevelSymbol(symbol)) {
						return name;
					}
					// In a global module system signature can be merged across file. So even parameters
					// must be exported to allow merging across files.
					const parameterDeclaration = Symbols.asParameterDeclaration(symbol);
					if (parameterDeclaration !== undefined && parameterDeclaration.parent.name !== undefined) {
						const parentSymbol = typeChecker.getSymbolAtLocation(parameterDeclaration.parent.name);
						if (parentSymbol !== undefined) {
							const parentValue = this.getExportPath(parentSymbol, kind, typeChecker);
							if (parentValue !== undefined) {
								result = `${parentValue}.${name}`;
								return result;
							}
						}
					}
				}
				return undefined;
			} else {
				const parentValue = this.getExportPath(parent, kind, typeChecker);
				// The parent is not exported so any member isn't either
				if (parentValue === undefined) {
					return undefined;
				} else {
					if (Symbols.isInterface(parent) || Symbols.isClass(parent) || Symbols.isTypeLiteral(parent)) {
						result = `${parentValue}.${name}`;
						return result;
					} else if (this.isExported(parent, symbol)) {
						result = parentValue.length > 0 ? `${parentValue}.${name}` : name;
						return result;
					} else {
						return undefined;
					}
				}
			}
		}

		private static matchPath(node: ts.Node, path: number[]): boolean {
			for (const kind of path) {
				if (node === undefined || node.kind !== kind) {
					return false;
				}
				node = node.parent;
			}
			return true;
		}

		private static isExported(parent: ts.Symbol, symbol: ts.Symbol): boolean {
			return parent.exports !== undefined && parent.exports.has(symbol.getName() as ts.__String);
		}
    }

    export function createMonikerIdentifier(path: string, symbol: string | undefined): string;
    export function createMonikerIdentifier(path: string | undefined, symbol: string): string;
    export function createMonikerIdentifier(path: string | undefined, symbol: string | undefined): string {
        if (path === undefined) {
            if (symbol === undefined || symbol.length === 0) {
                throw new Error(`Either path or symbol must be provided.`);
            }
            return `:${symbol}`;
        }
        if (symbol === undefined || symbol.length === 0) {
            return `${path.replace(/\:/g, '::')}:`;
        }
        return `${path.replace(/\:/g, '::')}:${symbol}`;
    }

	class TypeScriptSymbol
	{
		public static getUniqueSourceFiles(declarations: ts.Declaration[] | undefined): Set<ts.SourceFile> {
			let result: Set<ts.SourceFile> = new Set();
			if (declarations === undefined || declarations.length === 0) {
				return result;
			}
			for (let declaration of declarations) {
				result.add(declaration.getSourceFile());
			}
			return result;
		}

		public static getParent(symbol: ts.Symbol): ts.Symbol | undefined {
			return (symbol as InternalSymbol).parent;
		}

	}

}
