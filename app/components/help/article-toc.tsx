"use client";
import { useEffect, useState } from "react";
import type { HelpSection } from "@/lib/content/help";
import s from "../home-support.module.css";
export default function ArticleToc({sections}:{sections:HelpSection[]}){
 const [active,setActive]=useState(sections[0]?.id??"");
 useEffect(()=>{
  const update=()=>{
   const hash=decodeURIComponent(window.location.hash.slice(1));
   const target=sections.find(section=>section.id===hash);
   if(target){setActive(target.id);return;}
   const current=[...sections].reverse().find(section=>{const el=document.getElementById(section.id);return el&&el.getBoundingClientRect().top<=140;});
   setActive(current?.id??sections[0]?.id??"");
  };
  update();
  window.addEventListener("hashchange",update);
  window.addEventListener("scroll",update,{passive:true});
  return ()=>{window.removeEventListener("hashchange",update);window.removeEventListener("scroll",update);};
 },[sections]);
 return <aside className={s.toc} aria-label="Mục lục bài viết"><h2>Nội dung</h2><ul>{sections.map(section=><li key={section.id}><a href={`#${section.id}`} aria-current={active===section.id?"location":undefined} onClick={()=>setActive(section.id)}>{section.title}</a></li>)}</ul></aside>;
}
