/* Preserve legacy deep links. Only the previous overview/default entrance changes. */
(function(){
 'use strict';const p=new URLSearchParams(location.hash.slice(1));
 if(!location.hash||p.get('view')==='journey')location.replace('path.html');
})();
