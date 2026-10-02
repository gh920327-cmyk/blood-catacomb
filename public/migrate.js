/* 서버 이전: 옛 주소(Render)에서 넘어온 저장 데이터(#mig=...)를 이 주소의 브라우저 저장소로 옮긴다.
   캐릭터는 id별로 합치고(레벨·경험치가 높은 쪽 유지), 나머지 값은 이 주소에 없을 때만 넣는다. */
(function(){try{var h=location.hash;if(h.indexOf('#mig=')!==0)return;
  var o=JSON.parse(decodeURIComponent(escape(atob(h.slice(5)))));var n=0;
  for(var k in o){if(k.indexOf('bc_')!==0||typeof o[k]!=='string')continue;
    if(k==='bc_chars_v1'){var A=[],B=[];try{A=JSON.parse(localStorage.getItem(k)||'[]');}catch(e){}try{B=JSON.parse(o[k]);}catch(e){}
      if(!Array.isArray(A))A=[];if(!Array.isArray(B))B=[];
      for(var i=0;i<B.length;i++){var b=B[i];if(!b||!b.id)continue;var j=-1;for(var q=0;q<A.length;q++)if(A[q]&&A[q].id===b.id){j=q;break;}
        if(j<0){A.push(b);n++;}else{var a=A[j];if((b.lvl|0)>(a.lvl|0)||((b.lvl|0)===(a.lvl|0)&&(b.xp||0)>(a.xp||0)))A[j]=b;}}
      localStorage.setItem(k,JSON.stringify(A));}
    else if(localStorage.getItem(k)==null)localStorage.setItem(k,o[k]);}
  window.__bcMigrated=n;}catch(e){}
  try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}})();
