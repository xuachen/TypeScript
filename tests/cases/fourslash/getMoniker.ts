/// <reference path='fourslash.ts'/>

// @rootDir: ./src
// @outDir: ./lib

// @Filename: src/index.ts
////export class MyClass {
////    /*1*/sum(a: number, b: number): number {
////        return a + b;
////    }
////}

goTo.marker("1")
verify.getMonikerAtCaret(`index:MyClass.sum`)