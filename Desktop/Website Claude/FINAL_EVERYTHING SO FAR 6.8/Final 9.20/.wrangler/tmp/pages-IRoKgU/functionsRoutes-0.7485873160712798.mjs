import { onRequestGet as __api_qbo_callback_js_onRequestGet } from "/Users/mirmont/Desktop/Website Claude/FINAL_EVERYTHING SO FAR 6.8/Final 9.20/functions/api/qbo/callback.js"
import { onRequestGet as __api_qbo_connect_js_onRequestGet } from "/Users/mirmont/Desktop/Website Claude/FINAL_EVERYTHING SO FAR 6.8/Final 9.20/functions/api/qbo/connect.js"
import { onRequestPost as __api_qbo_disconnect_js_onRequestPost } from "/Users/mirmont/Desktop/Website Claude/FINAL_EVERYTHING SO FAR 6.8/Final 9.20/functions/api/qbo/disconnect.js"
import { onRequestGet as __api_qbo_search_js_onRequestGet } from "/Users/mirmont/Desktop/Website Claude/FINAL_EVERYTHING SO FAR 6.8/Final 9.20/functions/api/qbo/search.js"
import { onRequestGet as __api_qbo_status_js_onRequestGet } from "/Users/mirmont/Desktop/Website Claude/FINAL_EVERYTHING SO FAR 6.8/Final 9.20/functions/api/qbo/status.js"
import { onRequestPost as __api_send_summary_js_onRequestPost } from "/Users/mirmont/Desktop/Website Claude/FINAL_EVERYTHING SO FAR 6.8/Final 9.20/functions/api/send-summary.js"

export const routes = [
    {
      routePath: "/api/qbo/callback",
      mountPath: "/api/qbo",
      method: "GET",
      middlewares: [],
      modules: [__api_qbo_callback_js_onRequestGet],
    },
  {
      routePath: "/api/qbo/connect",
      mountPath: "/api/qbo",
      method: "GET",
      middlewares: [],
      modules: [__api_qbo_connect_js_onRequestGet],
    },
  {
      routePath: "/api/qbo/disconnect",
      mountPath: "/api/qbo",
      method: "POST",
      middlewares: [],
      modules: [__api_qbo_disconnect_js_onRequestPost],
    },
  {
      routePath: "/api/qbo/search",
      mountPath: "/api/qbo",
      method: "GET",
      middlewares: [],
      modules: [__api_qbo_search_js_onRequestGet],
    },
  {
      routePath: "/api/qbo/status",
      mountPath: "/api/qbo",
      method: "GET",
      middlewares: [],
      modules: [__api_qbo_status_js_onRequestGet],
    },
  {
      routePath: "/api/send-summary",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_send_summary_js_onRequestPost],
    },
  ]