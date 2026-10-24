const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
module.exports=function loader(stubs={},root=path.resolve(__dirname,'../..')){
  const cache=new Map();
  function load(file){
    if(stubs[file])return stubs[file];
    let target=file.startsWith('@/')?path.join(root,file.slice(2)):path.isAbsolute(file)?file:path.join(root,file);
    if(!fs.existsSync(target)) target+=fs.existsSync(target+'.ts')?'.ts':'.tsx';
    if(cache.has(target))return cache.get(target).exports;
    const mod={exports:{}};cache.set(target,mod);
    const src=ts.transpileModule(fs.readFileSync(target,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    function req(name){if(stubs[name])return stubs[name];if(name.startsWith('@/'))return load(name);if(name.startsWith('.'))return load(path.resolve(path.dirname(target),name));return require(name);}
    const sandbox={require:req,module:mod,exports:mod.exports,__dirname:path.dirname(target),__filename:target,process,console,Buffer,URL,URLSearchParams,Request,Response,Headers,AbortSignal,setTimeout,clearTimeout,fetch,crypto:globalThis.crypto};
    vm.runInNewContext(src,sandbox,{filename:target});return mod.exports;
  }return load;
};
