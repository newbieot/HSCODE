export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  // Jika pengunjung menggunakan link lama (.pages.dev)
  if (url.hostname === "hscode.pages.dev") {
    
    // Paksa ganti domainnya ke posnew.com
    url.hostname = "hs.posnew.com"; 
    
    // Lakukan redirect permanen (301)
    return Response.redirect(url.toString(), 301); 
  }
  
  // Jika domain sudah benar (posnew.com), biarkan lewat
  return context.next(); 
}
