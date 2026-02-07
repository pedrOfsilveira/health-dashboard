# Plan: Finalize Dashboard & Improve UX

We will clean up the codebase, improve UI feedback for the user, and implement the planned visual charts.

### Steps
1.  ✅ **Cleanup & Documentation**: Deleted `index.old.html` and updated `README.md` with proper project docs.
2.  ✅ **Improve Macro UI**: Dashboard now shows uncapped percentages (>100%) with red overage indicators and "+Xg" labels when macros are exceeded.
3.  ✅ **Add Visualizations**: Implemented macro pie chart using CSS `conic-gradient` showing PTN/CHO/FAT distribution with legend.
4.  ✅ **Enhance Error Handling**: Added `loadError` retry UI in Dashboard and `loadFailed` retry UI in QuickLog.

### Further Considerations
1.  **Meal Planner**: This is a large feature (Roadmap). Should we treat it as a separate Phase or start scoping the `suggest-meals` Edge Function integration now? My recommendation is to finalize the current dashboard improvements first, then start a new Phase for the Meal Planner since it involves both backend and frontend work and may require additional data modeling (e.g., meal templates, recipe database).
2.  **Notifications**: The roadmap mentions reminders. Do you want to enable browser Push Notifications now?