/// <reference path='fourslash.ts'/>

////export class MyClass {
////    /*1*/sum(a: number, b: number): number {
////        return a + b;
////    }
////}

goTo.marker("1")
verify.getMonikerAtCaret(`index:MyCoolClass.sum`)