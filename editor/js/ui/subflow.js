/**
 * Copyright 2015 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

RED.subflow = (function() {


    function getSubflow() {
        return RED.nodes.subflow(RED.workspaces.active());
    }

    function findAvailableSubflowIOPosition(subflow) {
        var pos = {x:70,y:70};
        for (var i=0;i<subflow.out.length+subflow.in.length;i++) {
            var port;
            if (i < subflow.out.length) {
                port = subflow.out[i];
            } else {
                port = subflow.in[i-subflow.out.length];
            }
            if (port.x == pos.x && port.y == pos.y) {
                pos.x += 55;
                i=0;
            }
        }
        return pos;
    }

    function addSubflowInput() {
        var subflow = RED.nodes.subflow(RED.workspaces.active());
        var position = findAvailableSubflowIOPosition(subflow);
        var newInput = {
            type:"subflow",
            direction:"in",
            z:subflow.id,
            i:subflow.in.length,
            x:position.x,
            y:position.y,
            id:RED.nodes.id()
        };
        var oldInCount = subflow.in.length;
        subflow.in.push(newInput);
        subflow.dirty = true;
        var wasDirty = RED.nodes.dirty();
        var wasChanged = subflow.changed;
        subflow.changed = true;

        RED.nodes.eachNode(function(n) {
            if (n.type == "subflow:"+subflow.id) {
                n.changed = true;
                n.inputs = subflow.in.length;
                RED.editor.updateNodeProperties(n);
            }
        });
        var historyEvent = {
            t:'edit',
            node:subflow,
            dirty:wasDirty,
            changed:wasChanged,
            subflow: {
                inputCount: oldInCount
            }
        };
        RED.history.push(historyEvent);
        $("#workspace-subflow-add-input").toggleClass("disabled",true);
        RED.view.select();
    }

    function addSubflowOutput(id) {
        var subflow = RED.nodes.subflow(RED.workspaces.active());
        var position = findAvailableSubflowIOPosition(subflow);

        var newOutput = {
            type:"subflow",
            direction:"out",
            z:subflow.id,
            i:subflow.out.length,
            x:position.x,
            y:position.y,
            id:RED.nodes.id()
        };
        var oldOutCount = subflow.out.length;
        subflow.out.push(newOutput);
        subflow.dirty = true;
        var wasDirty = RED.nodes.dirty();
        var wasChanged = subflow.changed;
        subflow.changed = true;

        RED.nodes.eachNode(function(n) {
            if (n.type == "subflow:"+subflow.id) {
                n.changed = true;
                n.outputs = subflow.out.length;
                RED.editor.updateNodeProperties(n);
            }
        });
        var historyEvent = {
            t:'edit',
            node:subflow,
            dirty:wasDirty,
            changed:wasChanged,
            subflow: {
                outputCount: oldOutCount
            }
        };
        RED.history.push(historyEvent);
        RED.view.select();
    }

    function init() {
        $("#workspace-subflow-edit").click(function(event) {
            RED.editor.editSubflow(RED.nodes.subflow(RED.workspaces.active()));
            event.preventDefault();
        });
        $("#workspace-subflow-add-input").click(function(event) {
            event.preventDefault();
            if ($(this).hasClass("disabled")) {
                return;
            }
            addSubflowInput();
        });
        $("#workspace-subflow-add-output").click(function(event) {
            event.preventDefault();
            if ($(this).hasClass("disabled")) {
                return;
            }
            addSubflowOutput();
        });

        $("#workspace-subflow-delete").click(function(event) {
            event.preventDefault();
            var removedNodes = [];
            var removedLinks = [];
            var startDirty = RED.nodes.dirty();

            RED.nodes.eachNode(function(n) {
                if (n.type == "subflow:"+getSubflow().id) {
                    removedNodes.push(n);
                }
                if (n.z == getSubflow().id) {
                    removedNodes.push(n);
                }
            });

            for (var i=0;i<removedNodes.length;i++) {
                var rmlinks = RED.nodes.remove(removedNodes[i].id);
                removedLinks = removedLinks.concat(rmlinks);
            }

            var activeSubflow = getSubflow();

            RED.nodes.removeSubflow(activeSubflow);

            RED.history.push({
                    t:'delete',
                    nodes:removedNodes,
                    links:removedLinks,
                    subflow: activeSubflow,
                    dirty:startDirty
            });

            RED.workspaces.remove(activeSubflow);
            RED.nodes.dirty(true);
            RED.view.redraw();
        });

        RED.view.on("selection-changed",function(selection) {
            if (!selection.nodes) {
                RED.menu.setDisabled("menu-item-subflow-convert",true);
            } else {
                RED.menu.setDisabled("menu-item-subflow-convert",false);
            }
        });

    }

    function createSubflow() {
        var lastIndex = 0;
        RED.nodes.eachSubflow(function(sf) {
           var m = (new RegExp("^Subflow (\\d+)$")).exec(sf.name);
           if (m) {
               lastIndex = Math.max(lastIndex,m[1]);
           }
        });

        var name = "Subflow "+(lastIndex+1);

        var subflowId = RED.nodes.id();
        var subflow = {
            type:"subflow",
            id:subflowId,
            name:name,
            in: [],
            out: []
        };
        RED.nodes.addSubflow(subflow);
        RED.history.push({
            t:'createSubflow',
            subflow: subflow,
            dirty:RED.nodes.dirty()
        });
        RED.workspaces.show(subflowId);
    }

    function convertToSubflow() {
        var selection = RED.view.selection();
        if (!selection.nodes) {
            RED.notify(RED._("subflow.errors.noNodesSelected"),"error");
            return;
        }
        var i;
        var nodes = {};
        var new_links = [];
        var removedLinks = [];

        var candidateInputs = [];
        var candidateOutputs = [];

        var boundingBox = [selection.nodes[0].x,
            selection.nodes[0].y,
            selection.nodes[0].x,
            selection.nodes[0].y];

        for (i=0;i<selection.nodes.length;i++) {
            var n = selection.nodes[i];
            nodes[n.id] = {n:n,outputs:{}};
            boundingBox = [
                Math.min(boundingBox[0],n.x),
                Math.min(boundingBox[1],n.y),
                Math.max(boundingBox[2],n.x),
                Math.max(boundingBox[3],n.y)
            ]
        }

        var center = [(boundingBox[2]+boundingBox[0]) / 2,(boundingBox[3]+boundingBox[1]) / 2];

        RED.nodes.eachLink(function(link) {
            if (nodes[link.source.id] && nodes[link.target.id]) {
                // A link wholely within the selection
            }

            if (nodes[link.source.id] && !nodes[link.target.id]) {
                // An outbound link from the selection
                candidateOutputs.push(link);
                removedLinks.push(link);
            }
            if (!nodes[link.source.id] && nodes[link.target.id]) {
                // An inbound link
                candidateInputs.push(link);
                removedLinks.push(link);
            }
        });

        var outputs = {};
        candidateOutputs = candidateOutputs.filter(function(v) {
             if (outputs[v.source.id+":"+v.sourcePort]) {
                 outputs[v.source.id+":"+v.sourcePort].targets.push(v.target);
                 return false;
             }
             v.targets = [];
             v.targets.push(v.target);
             outputs[v.source.id+":"+v.sourcePort] = v;
             return true;
        });
        candidateOutputs.sort(function(a,b) { return a.source.y-b.source.y});

        if (candidateInputs.length > 1) {
             RED.notify(RED._("subflow.errors.multipleInputsToSelection"),"error");
             return;
        }
        //if (candidateInputs.length == 0) {
        //     RED.notify("<strong>Cannot create subflow</strong>: no input to selection","error");
        //     return;
        //}


        var lastIndex = 0;
        RED.nodes.eachSubflow(function(sf) {
           var m = (new RegExp("^Subflow (\\d+)$")).exec(sf.name);
           if (m) {
               lastIndex = Math.max(lastIndex,m[1]);
           }
        });

        var name = "Subflow "+(lastIndex+1);

        var subflowId = RED.nodes.id();
        var subflow = {
            type:"subflow",
            id:subflowId,
            name:name,
            in: candidateInputs.map(function(v,i) { var index = i; return {
                type:"subflow",
                direction:"in",
                x:v.target.x-(v.target.w/2)-80,
                y:v.target.y,
                z:subflowId,
                i:index,
                id:RED.nodes.id(),
                wires:[{id:v.target.id}]
            }}),
            out: candidateOutputs.map(function(v,i) { var index = i; return {
                type:"subflow",
                direction:"in",
                x:v.source.x+(v.source.w/2)+80,
                y:v.source.y,
                z:subflowId,
                i:index,
                id:RED.nodes.id(),
                wires:[{id:v.source.id,port:v.sourcePort}]
            }})
        };
        RED.nodes.addSubflow(subflow);

        var subflowInstance = {
            id:RED.nodes.id(),
            type:"subflow:"+subflow.id,
            x: center[0],
            y: center[1],
            z: RED.workspaces.active(),
            inputs: subflow.in.length,
            outputs: subflow.out.length,
            h: Math.max(30/*node_height*/,(subflow.out.length||0) * 15),
            changed:true
        }
        subflowInstance._def = RED.nodes.getType(subflowInstance.type);
        RED.editor.validateNode(subflowInstance);
        RED.nodes.add(subflowInstance);

        candidateInputs.forEach(function(l) {
            var link = {source:l.source, sourcePort:l.sourcePort, target: subflowInstance};
            new_links.push(link);
            RED.nodes.addLink(link);
        });

        candidateOutputs.forEach(function(output,i) {
            output.targets.forEach(function(target) {
                var link = {source:subflowInstance, sourcePort:i, target: target};
                new_links.push(link);
                RED.nodes.addLink(link);
            });
        });

        subflow.in.forEach(function(input) {
            input.wires.forEach(function(wire) {
                var link = {source: input, sourcePort: 0, target: RED.nodes.node(wire.id) }
                new_links.push(link);
                RED.nodes.addLink(link);
            });
        });
        subflow.out.forEach(function(output,i) {
            output.wires.forEach(function(wire) {
                var link = {source: RED.nodes.node(wire.id), sourcePort: wire.port , target: output }
                new_links.push(link);
                RED.nodes.addLink(link);
            });
        });

        for (i=0;i<removedLinks.length;i++) {
            RED.nodes.removeLink(removedLinks[i]);
        }

        for (i=0;i<selection.nodes.length;i++) {
            selection.nodes[i].z = subflow.id;
        }

        RED.history.push({
            t:'createSubflow',
            nodes:[subflowInstance.id],
            links:new_links,
            subflow: subflow,

            activeWorkspace: RED.workspaces.active(),
            removedLinks: removedLinks,

            dirty:RED.nodes.dirty()
        });

        RED.editor.validateNode(subflow);
        RED.nodes.dirty(true);
        RED.view.redraw(true);
    }



    return {
        init: init,
        createSubflow: createSubflow,
        convertToSubflow: convertToSubflow
    }
})();
