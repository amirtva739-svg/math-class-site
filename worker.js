export default {
  async fetch(request, env) {
    try {
      const result = await env.DB
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all();

      return new Response(
        JSON.stringify({
          success: true,
          tables: result.results
        }, null, 2),
        {
          headers: {
            "content-type": "application/json; charset=UTF-8"
          }
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message
        }, null, 2),
        {
          status: 500,
          headers: {
            "content-type": "application/json; charset=UTF-8"
          }
        }
      );
    }
  }
};
