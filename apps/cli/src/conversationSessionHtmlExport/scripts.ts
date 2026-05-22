// FOUC-prevention script: runs inside <head> BEFORE styles parse so the body
// never paints with the wrong theme.
export function renderConversationSessionExportFoucScript(): string {
  return `(function(){try{var t=localStorage.getItem("buli-export-theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;
}

// Runtime script: theme toggle, trace map, copy buttons, IntersectionObserver
// active rail, back-to-top, keyboard nav (j/k/?/T/Esc).
export function renderConversationSessionExportRuntimeScript(): string {
  return `(function(){
  var STORAGE_KEY="buli-export-theme";
  var html=document.documentElement;
  function effectiveTheme(){
    var theme=html.getAttribute("data-theme");
    if(theme==="auto"){return window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}
    return theme||"light";
  }
  function syncThemeIcons(){
    var eff=effectiveTheme();
    var sun=document.querySelector(".i-sun");
    var moon=document.querySelector(".i-moon");
    if(sun&&moon){sun.style.display=eff==="dark"?"none":"";moon.style.display=eff==="dark"?"":"none";}
  }
  syncThemeIcons();
  var themeButton=document.getElementById("theme-toggle");
  if(themeButton){
    themeButton.addEventListener("click",function(){
      var next=effectiveTheme()==="dark"?"light":"dark";
      html.setAttribute("data-theme",next);
      try{localStorage.setItem(STORAGE_KEY,next);}catch(e){}
      syncThemeIcons();
    });
  }

  var entries=Array.prototype.slice.call(document.querySelectorAll(".entry"));
  var traceHost=document.getElementById("trace-cells");
  if(traceHost){
    entries.forEach(function(entryEl){
      var role=entryEl.getAttribute("data-role")||"assistant";
      var label=entryEl.getAttribute("data-trace-label")||entryEl.id;
      var num=entryEl.getAttribute("data-entry-number")||"";
      var cell=document.createElement("a");
      cell.className="trace-cell";
      cell.href="#"+entryEl.id;
      cell.setAttribute("data-role",role);
      cell.title=(num?"#"+num+" - ":"")+label;
      traceHost.appendChild(cell);
    });
  }

  document.querySelectorAll("[data-copy]").forEach(function(btn){
    btn.addEventListener("click",function(){
      var container=btn.parentElement;
      var text=container?container.getAttribute("data-copy-text"):null;
      if(text===null||text===undefined){
        var codeNode=container?container.querySelector("code"):null;
        text=codeNode?codeNode.innerText:(container?container.innerText:"");
      }
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(function(){
          btn.setAttribute("data-copied","true");
          setTimeout(function(){btn.removeAttribute("data-copied");},1400);
        }).catch(function(){});
      }
    });
  });

  var railItems=document.querySelectorAll(".rail-item");
  function setActiveRail(targetId){
    railItems.forEach(function(el){
      el.classList.toggle("active",el.getAttribute("data-target")===targetId);
    });
  }
  if("IntersectionObserver" in window){
    var io=new IntersectionObserver(function(observed){
      var topId=null;var topY=Infinity;
      observed.forEach(function(o){
        if(o.isIntersecting){
          var y=o.boundingClientRect.top;
          if(y>=0&&y<topY){topY=y;topId=o.target.id;}
        }
      });
      if(topId){setActiveRail(topId);}
    },{rootMargin:"-80px 0px -70% 0px",threshold:[0,0.1]});
    entries.forEach(function(e){io.observe(e);});
  }

  var totop=document.getElementById("totop");
  if(totop){
    window.addEventListener("scroll",function(){
      if(window.scrollY>600){totop.classList.add("visible");}else{totop.classList.remove("visible");}
    },{passive:true});
    totop.addEventListener("click",function(){window.scrollTo({top:0,behavior:"smooth"});});
  }

  var dialog=document.getElementById("dialog");
  function closeDialog(){if(dialog){dialog.classList.remove("open");}}
  function openDialog(){if(dialog){dialog.classList.add("open");}}
  var shortcutsButton=document.getElementById("shortcuts-btn");
  if(shortcutsButton){shortcutsButton.addEventListener("click",openDialog);}
  if(dialog){dialog.addEventListener("click",function(e){if(e.target===dialog){closeDialog();}});}

  function focusedEntryIndex(){
    var hash=location.hash.replace("#","");
    var foundIndex=entries.findIndex(function(e){return e.id===hash;});
    if(foundIndex>=0){return foundIndex;}
    var top=window.scrollY+100;
    for(var j=entries.length-1;j>=0;j--){
      if(entries[j].offsetTop<=top){return j;}
    }
    return 0;
  }
  function jumpTo(i){
    if(i<0||i>=entries.length){return;}
    var el=entries[i];
    history.replaceState(null,"","#"+el.id);
    el.scrollIntoView({behavior:"smooth",block:"start"});
    entries.forEach(function(e){e.classList.remove("active");});
    el.classList.add("active");
    setTimeout(function(){el.classList.remove("active");},1200);
  }
  document.addEventListener("keydown",function(e){
    if(e.target&&(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA")){return;}
    if(e.metaKey||e.ctrlKey||e.altKey){return;}
    if(e.key==="Escape"){closeDialog();return;}
    if(dialog&&dialog.classList.contains("open")){return;}
    if(e.key==="?"||(e.key==="/"&&e.shiftKey)){e.preventDefault();openDialog();return;}
    if(e.key==="j"||e.key==="ArrowDown"){e.preventDefault();jumpTo(focusedEntryIndex()+1);}
    if(e.key==="k"||e.key==="ArrowUp"){e.preventDefault();jumpTo(focusedEntryIndex()-1);}
    if(e.key==="t"||e.key==="T"){if(themeButton){themeButton.click();}}
  });
})();`;
}
