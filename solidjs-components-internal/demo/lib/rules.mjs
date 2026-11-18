// Ruleset DSL for the demo app, in the same structure SDMS uses ({ #include ..., ruleset: { ruleX: {...} } }).
// Values that come from the seed (default status, which statuses are "done", ...) are embedded as JSON.

const json = (value) => JSON.stringify(value);

/**
 * The published board's icon for each of this app's issue types (it only knows SDMS's Bug, Feature,
 * Change Request, Release, Documentation, Security and Suggestion; anything else gets a "?").
 * Release is left out: its icon needs the Material Symbols font, which fieldtec-web doesn't load.
 */
const BOARD_ICON_TYPES = { Story: 'Feature', Task: 'Change Request', Improvement: 'Suggestion', Epic: 'Documentation' };

/**
 * Issue form rules: run on PreRender, OnLoad and OnFieldChange.
 * @param {{ defaults: Record<string, object>, lockedFields: string[] }} o
 * @returns {string}
 */
export function issueClientRules({ defaults, lockedFields }) {
  return `{
#include "JayRule Ruleset Overlay JS",
ruleset : {
  name : "Tracker Issue - Client",

  ruleInitialise : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      ntf.isSetup = ntf.context.eventName === 'PreRender' || ntf.context.eventName === 'OnLoad';
      ntf.isNewIssue = !ntf.document.itemRef;
    }
  },

  // A new issue is reported by whoever creates it.
  ruleDefaultReporter : {
    ruleCondition : function (ntf) {
      return ntf.isSetup && ntf.isNewIssue && !(ntf.document.reporterRel && ntf.document.reporterRel.length);
    },
    ruleAction : function (ntf) {
      var user = ntf.context.user || {};
      ntf.document.reporterRel = [{
        documentId: ntf.userId,
        name: user.systemHeader ? user.systemHeader.summaryName : '',
        email: user.email || null
      }];
    }
  },

  // A new issue starts as a Medium-priority Task in "To Do".
  ruleDefaults : {
    ruleCondition : function (ntf) { return ntf.isSetup && ntf.isNewIssue; },
    ruleAction : function (ntf) {
      var defaults = ${json(defaults)};
      for (var field in defaults) {
        if (!(ntf.document[field] && ntf.document[field].length)) ntf.document[field] = [defaults[field]];
      }
    }
  },

  // Assignee and watchers only list people on the issue's project (accounts carry sdmsProjectRel).
  ruleProjectPeople : {
    ruleCondition : function (ntf) { return ntf.isSetup || ntf.context.fieldChanged === 'projectRel'; },
    ruleAction : function (ntf) {
      var filter = {'sort':[{'systemHeader.summaryName':'asc'}],'query':{'bool':{
        'filter':[{'term':{'systemHeader.systemType':'account'}}],
        'must_not':[{'term':{'inactiveBool':true}}]}}};
      var project = ntf.document.projectRel && ntf.document.projectRel[0];
      if (project) filter.query.bool.filter.push({'term':{'sdmsProjectRel.documentId':project.documentId}});
      ntf.scope.setFilter('assigneeRel', filter);
      ntf.scope.setFilter('monitoringRel', filter);
    }
  },

  // A status with disableItemBool ("Won't Do") makes the issue read-only until it is reopened.
  ruleLockedStatus : {
    ruleCondition : function (ntf) { return ntf.isSetup || ntf.context.fieldChanged === 'statusRel'; },
    ruleAction : function (ntf) {
      var status = ntf.document.statusRel && ntf.document.statusRel[0];
      var locked = !!(status && status.disableItemBool);
      // Fields start enabled, so on load only a locked issue needs changing (and sc-markdown
      // logs an error when its enabled flag is set before its editor has rendered).
      if (ntf.isSetup && !locked) return;
      ${json(lockedFields)}.forEach(function (field) { ntf.scope.enableField(field, !locked); });
    }
  }
}
}`;
}

/**
 * Issue rules on the server, before every save (also covers board moves and API updates).
 * @param {{ resolutionByStatusId: Record<string, object> }} o  default resolution per "done" status
 * @returns {string}
 */
export function issueServerRules({ resolutionByStatusId }) {
  return `{
#include "JayRule Ruleset Overlay JS",
ruleset : {
  name : "Tracker Issue - PreSaveServer",

  // Who and when, for the issue lists ("Updated") and the activity panel.
  ruleAuthorship : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var now = new Date().toISOString();
      var user = ntf.context.user || {};
      var me = { documentId: ntf.userId, name: user.systemHeader ? user.systemHeader.summaryName : '' };
      if (!ntf.document.createdDate) ntf.document.createdDate = now;
      if (!(ntf.document.createdByRel && ntf.document.createdByRel.length)) ntf.document.createdByRel = [me];
      ntf.document.updatedDate = now;
      ntf.document.updatedByRel = [me];
    }
  },

  // A finished issue always has a resolution and a resolved date; reopening clears both.
  ruleResolution : {
    ruleCondition : true,
    ruleAction : function (ntf) {
      var defaults = ${json(resolutionByStatusId)};
      var status = ntf.document.statusRel && ntf.document.statusRel[0];
      var done = !!(status && defaults[status.documentId]);
      var hasResolution = !!(ntf.document.resolutionRel && ntf.document.resolutionRel.length);
      if (done && !hasResolution) ntf.document.resolutionRel = [defaults[status.documentId]];
      if (!done && hasResolution) ntf.document.resolutionRel = [];
      if (done && !ntf.document.resolvedDate) ntf.document.resolvedDate = new Date().toISOString();
      if (!done && ntf.document.resolvedDate) ntf.document.resolvedDate = null;
    }
  }
}
}`;
}

/**
 * Board rules for <solid-intray-board> (published in @formbird/angular-elements 8.5.11):
 * - it reads search results as `hits.hits[]` documents, but fieldtec-web returns
 *   `data.hits.hits[]._source`, so on its own it shows no columns; the rule loads the statuses and
 *   issues and sets them as element properties, which take precedence over its own fetch;
 * - it only reports drops (`intray-board-item-moved`); the rule saves them and reloads the data;
 * - its card icons are hard-coded to SDMS item type names, so the rule hands it the nearest SDMS
 *   name for each of this app's types (`BOARD_ICON_TYPES`). Display only: a move re-reads the stored
 *   issue and patches status and assignee, so the renamed type is never saved.
 * @param {{ statusesByName: Record<string, object>, peopleById: Record<string, object>, transitions: Record<string, string[]> }} o
 * @returns {string}
 */
export function boardClientRules({ statusesByName, peopleById, transitions }) {
  return `{
#include "JayRule Ruleset Overlay JS",
ruleset : {
  name : "Tracker Board - Client",

  ruleLoadBoard : {
    ruleCondition : function (ntf) { return ntf.context.eventName === 'OnLoad'; },
    ruleAction : function (ntf) {
      window.__trackerBoardProjects = (ntf.document.projectRel || []).map(function (p) { return p.documentId; });
      window.__trackerLoadBoard = function () {
        var search = window.FormbirdServiceInjector.get('SearchClientService');
        var sources = function (result) {
          var hits = (result && result.data && result.data.hits && result.data.hits.hits) || (result && result.hits && result.hits.hits) || [];
          return hits.map(function (hit) { return hit && hit._source ? hit._source : hit; });
        };
        var tagged = function (tag) {
          return [{'term':{'systemHeader.systemType':'document'}},{'term':{'appTags':tag}},{'term':{'appTags':'sdms'}}];
        };
        var iconTypes = ${json(BOARD_ICON_TYPES)};
        var withBoardIcon = function (item) {
          var type = item.typeRel && item.typeRel[0];
          if (!type || !iconTypes[type.name]) return item;
          return Object.assign({}, item, { typeRel: [Object.assign({}, type, { name: iconTypes[type.name] })] });
        };
        return search.search({ page: 0, pageSize: 50, filter: {
          'sort':[{'indexNum':'asc'}],
          'query':{'bool':{'filter':tagged('status'),'must_not':[{'term':{'inactiveBool':true}}]}}
        } }).then(function (result) {
          var columns = sources(result).map(function (s) { return { name: s.systemHeader.summaryName, color: s.color || '#a1a1aa' }; });
          var filter = tagged('item').concat([
            {'exists':{'field':'assigneeRel'}},
            {'terms':{'statusRel.name':columns.map(function (c) { return c.name; })}}
          ]);
          if (window.__trackerBoardProjects.length) filter.push({'terms':{'projectRel.documentId':window.__trackerBoardProjects}});
          return search.search({ page: 0, pageSize: 500, filter: {
            'sort':[{'systemHeader.createdDate':{'order':'desc'}}],
            'query':{'bool':{'filter':filter}}
          } }).then(function (items) { return { columns: columns, items: sources(items).map(withBoardIcon) }; });
        }).then(function (data) {
          var attempts = 0;
          (function apply() {
            var board = document.querySelector('solid-intray-board');
            if (!board) { if (attempts++ < 80) setTimeout(apply, 250); return; }
            board.statusColumns = data.columns;
            board.items = data.items;
            board.loading = false;
          })();
        });
      };
      window.__trackerLoadBoard();
    }
  },

  ruleSaveCardMoves : {
    ruleCondition : function (ntf) { return ntf.context.eventName === 'OnLoad'; },
    ruleAction : function (ntf) {
      if (window.__trackerBoardMoves) return;
      window.__trackerBoardMoves = true;
      var statuses = ${json(statusesByName)};
      var people = ${json(peopleById)};
      var transitions = ${json(transitions)};

      document.addEventListener('intray-board-item-moved', function (event) {
        var move = event.detail || {};
        var services = window.FormbirdServiceInjector;
        var data = services.get('DataService');
        var notify = services.get('NotificationService');
        var statusChanged = move.newStatus !== move.oldStatus;
        if (statusChanged && (transitions[move.oldStatus] || []).indexOf(move.newStatus) < 0) {
          notify.error(move.oldStatus + ' can\\'t move to ' + move.newStatus);
          return;
        }
        data.getDocument(move.docId).then(function (original) {
          var updated = JSON.parse(JSON.stringify(original));
          if (statusChanged && statuses[move.newStatus]) updated.statusRel = [statuses[move.newStatus]];
          if (move.newAssigneeId !== move.oldAssigneeId && people[move.newAssigneeId]) updated.assigneeRel = [people[move.newAssigneeId]];
          return data.jsonPatchUpdate(original, updated).then(function () { return updated; });
        }).then(function (updated) {
          notify.success((updated.itemRef || 'Issue') + ' moved to ' + move.newStatus);
          // Reload the board's data once the search index has caught up with the save.
          setTimeout(function () { if (window.__trackerLoadBoard) window.__trackerLoadBoard(); }, 1200);
        }).catch(function (error) {
          notify.error('Could not move the card: ' + ((error && error.message) || error));
        });
      });
    }
  }
}
}`;
}
