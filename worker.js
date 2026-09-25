export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("Math Class Worker is working!", {
        headers: {
          "content-type": "text/plain; charset=UTF-8"
        }
      });
    }

    return new Response("Not Found", {
      status: 404
    });
  }
};
