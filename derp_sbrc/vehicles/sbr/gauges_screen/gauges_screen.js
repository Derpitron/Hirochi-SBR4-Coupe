
angular.module('gaugesScreen', [])
.directive('bngMapRenderUncompressed', function () {
  return {
    template: `<svg width="100%" height="100%" class="container"></svg>`,
    scope: {
      map: '<',
      color: '@?',
      width: '@?',
      drivability: '@?'
    },
    replace: true,
    restrict: 'E',
    link: function (scope, element, attrs) {
      "use strict";
      var svg = element[0]
        , mapScale = 1
        , domElems = {}
        , getColor = (rClass) => scope.color || (rClass === 0 ? 'black' : 'white') // if there is a color set use that otherwise use the defaults
        ;

      function isEmpty (obj) {
        return Object.keys(obj).length === 0;
      }

      function calcRadius (radius) {
        return  Math.min(Math.max(radius, 0), 5) * 3
      }

      scope.$watch('map', function (newVal) {
        if (newVal && !isEmpty(newVal)) {
          setupMap(newVal, angular.element(svg));
        }
      })

      function _createLine(p1, p2, color) {
         return hu('<line>', svg).attr({
          x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
          stroke: color,
          strokeWidth: Math.max(p1.radius, p2.radius),
          strokeLinecap: "round",
        });
      }

      function drawRoads(nodes, drivabilityMin, drivabilityMax) {
        var drawn = {};
        for (var key in nodes) {
          var el = nodes[key];
          // walk the links of the node
          if (el.links !== undefined) { // links
            for (var key2 in el.links) {
              var el2 = nodes[key2];
              var drivability = el.links[key2].drivability;
              if (el2 !== undefined) {
                if (drivability >= drivabilityMin && drivability <= drivabilityMax) {
                  // TODO: can we find a better key here please?
                  drawn[key + '.' + key2 + drivabilityMin + drivabilityMax] = true;
                  if (domElems[key + '.' + key2 + drivabilityMin + drivabilityMax] !== undefined) {
                    domElems[key + '.' + key2 + drivabilityMin + drivabilityMax].remove();
                  }
                  domElems[key + '.' + key2 + drivabilityMin + drivabilityMax] = _createLine({
                    x: el.pos[0] / mapScale,
                    y: -el.pos[1] / mapScale,
                    radius: calcRadius(el.radius)
                  }, {
                      x: el2.pos[0] / mapScale,
                      y: -el2.pos[1] / mapScale,
                      radius: calcRadius(el2.radius)    // prevents massive blobs due to waypoints having larger radius'
                    }, getColor(drivability)
                  );
                }
              }
            }
          }
        }

        // remove all elems that are from previous calls
        for (var key in domElems) {
          if (!drawn[key] && key.endsWith('' + drivabilityMin + drivabilityMax)) {
            domElems[key].remove()
            domElems[key] = undefined; // delete domNode reference and allow for gc
          }
        }
      }

      function setupMap(data) {
        if (data != null) {

          svg.setAttribute('viewBox', data.viewParams.join(' '));

          // draw dirt roads and then normal on top
          if (scope.drivability !== 'false') {
            drawRoads(data.nodes, 0, 0.9);
            drawRoads(data.nodes, 0.9, 1);
          } else {
            drawRoads(data.nodes, 0, 1);
          }
        }
      }
    }
  };
})

  .controller('GaugesScreenController', function ($scope, $element, $window) {
    "use strict";
    var vm = this;

    var svg;
    var navContainer = $element[0].children[0];
    var navDimensions = [];

    var speedoDisplay = { gears: {} };
    var navDisplay = {};
    var infoDisplay = {};
    var consumGraph = {values:{current: 0,avg: 0}};
    var electrics = {lights:{} };
    var gForcesVisible = false;

    var backgroundGradient = {};
    var overlayGradient = {};
    var navMarkerGradient = {};
    // var backgroundClipGradient;

    var speedoInitialised = false;
    var currentGear = '';
    var prevspeedAng = 0;

    var ready = false;

    var unit = "metric";
    var unitspeedratio = 3.6/260*Math.PI*1.5;

    function setTheme(hue) {
      // speedo
      speedoDisplay.speedTicks.css({'stroke': `hsl(${hue}, 70%, 50%)`, 'stroke-width': '0.5px'});
      speedoDisplay.needle.css({'stroke': `hsl(${hue}, 70%, 50%)`, 'stroke-width': '0.5px'});
      speedoDisplay.needle_bar.css({'stroke': `hsl(${hue}, 70%, 50%)`, 'stroke-width': '0.5px'});

      // info
      infoDisplay.infoOverlay.css({'stroke': `hsl(${hue}, 100%, 30%)`, 'stroke-width': '0.5px'});

      // info
      navDisplay.overlay.css({'stroke': `hsl(${hue}, 100%, 30%)`, 'stroke-width': '0.5px'});

      // gradients
      overlayGradient.stop1.css({stopColor: `hsl(${hue}, 100%, 20%)`})
      overlayGradient.stop2.css({stopColor: `hsl(${hue}, 100%, 10%)`})

      backgroundGradient.stop1.css({"stop-color": `hsl(${hue}, 100%, 0%)`})
      backgroundGradient.stop2.css({"stop-color": `hsl(${hue}, 100%, 0%)`})

      navMarkerGradient.stop1.css({"stop-color": `hsl(${hue}, 100%, 50%)`})
      navMarkerGradient.stop2.css({"stop-color": `hsl(${hue}, 100%, 30%)`})

      // background color
      $element[0].style.backgroundColor = "black";
      //$element[0].style.backgroundColor = `hsl(${hue}, 70%, 20%)`;
    }

    // Make sure SVG is loaded
    $scope.onSVGLoaded = function () {
      svg = $element[0].children[1].children[0];

      // speedometer
      speedoDisplay.root = hu('#speedometer', svg);
      speedoDisplay.speedometerText = hu('#speedometerText', speedoDisplay.root)
      speedoDisplay.speedValue = hu('#speedValue', speedoDisplay.speedometerText);
      speedoDisplay.speedUnit = hu('#speedUnit', speedoDisplay.speedometerText);
      speedoDisplay.speedTicks = hu('#speedTicks', speedoDisplay.speedometerText);
      speedoDisplay.speedTicksText  = hu('#speedTicksText', speedoDisplay.speedometerText);
      speedoDisplay.gears.P = hu('#gearP', speedoDisplay.speedometerText);
      speedoDisplay.gears.R = hu('#gearR', speedoDisplay.speedometerText);
      speedoDisplay.gears.N = hu('#gearN', speedoDisplay.speedometerText);
      speedoDisplay.gears.D = hu('#gearD', speedoDisplay.speedometerText);
      speedoDisplay.gears.S = hu('#gearS', speedoDisplay.speedometerText);
      speedoDisplay.needle = hu('#needle', speedoDisplay.root);
      //speedoDisplay.needle.css({transformOrigin: '68px 33px', transform: 'rotate(227deg)'}).attr({class: "fade-in"});
      speedoDisplay.needle.attr({class: "fade-in"}).css({stroke: "#00ffff"});
      speedoDisplay.needle_bar = hu('#needle_bar', speedoDisplay.root);
      speedoDisplay.needle_bar.attr({class: "fade-in"});
      speedoDisplay.needle_gradients = [];
      speedoDisplay.needle_gradients.push(hu('#radialGradient965', svg));
      speedoDisplay.needle_gradients.push(hu('#radialGradient977', svg));

      // info
      infoDisplay.root = hu('#information', svg);
      infoDisplay.infoOverlay = hu('#infoOverlay', infoDisplay.root);
      infoDisplay.infoValues = hu('#infoValues', infoDisplay.root);
      // var ivbox = infoDisplay.root.n.getBBox()
      // console.log("infovalu", ((ivbox.y+ivbox.width/2)/svg.getBBox().width)*100,((ivbox.x+ivbox.height/2)/svg.getBBox().height)*100)

      infoDisplay.accelerometer = hu('#accelerometer', infoDisplay.root);
      infoDisplay.accelerometerMarker = hu('#accelerometerMarker', infoDisplay.accelerometer);
      infoDisplay.gXNegative = hu('#gXNegative', infoDisplay.root);
      infoDisplay.gXPositive = hu('#gXPositive', infoDisplay.root);
      infoDisplay.gYNegative = hu('#gYNegative', infoDisplay.root);
      infoDisplay.gYPositive = hu('#gYPositive', infoDisplay.root);

      consumGraph.root = hu('#consum_graph_layer', svg);
      // var cbox = consumGraph.root.n.getBBox()
      // console.log("consum_graph_layer", ((cbox.y+cbox.width/2)/svg.getBBox().width)*100,((cbox.x+cbox.height/2)/svg.getBBox().height)*100)
      consumGraph.graph_canvas = document.getElementById('consum_graph_canvas');
      consumGraph.graph_canvas_ctx = consumGraph.graph_canvas.getContext("2d");
      consumGraph.graph_canvas_gradiant_o = consumGraph.graph_canvas_ctx.createLinearGradient(0,0,0,consumGraph.graph_canvas.height);
      consumGraph.graph_canvas_gradiant_o.addColorStop(0, 'rgba(0,204,153,0.5)');
      consumGraph.graph_canvas_gradiant_o.addColorStop(0.6, 'rgba(0,204,153,0)');
      consumGraph.graph_canvas_gradiant_o.addColorStop(1, 'rgba(0,204,153,0)');
      consumGraph.graph_canvas_gradiant_g = consumGraph.graph_canvas_ctx.createLinearGradient(0,0,0,consumGraph.graph_canvas.height);
      consumGraph.graph_canvas_gradiant_g.addColorStop(0, 'rgba(51,51,255,0)');
      consumGraph.graph_canvas_gradiant_g.addColorStop(0.75, 'rgba(51,51,255,0)');
      consumGraph.graph_canvas_gradiant_g.addColorStop(1, 'rgba(51,51,255,0.5)');

      infoDisplay.accelerometer.css({opacity: 0})
      infoDisplay.infoValues.css({opacity: 0})
      infoDisplay.infoValuesTxt = { range: hu('#rangeTxt', infoDisplay.infoValues),
        now: hu('#nowTxt', infoDisplay.infoValues),
        avg: hu('#avgTxt', infoDisplay.infoValues),
        odo: hu('#odoTxt', infoDisplay.infoValues),
      };

      // nav
      navDisplay.root = hu('#navigation', svg);
      navDisplay.overlay = hu('#MapOverlay', navDisplay.root);

      // animations
      speedoDisplay.root.attr({class: "fade-in"}).on('webkitAnimationEnd', function (){
        //speedoDisplay.needle.attr({class: "rotate"});
      });
      speedoInitialised = true;
      speedoDisplay.needle.on('webkitAnimationEnd', function (){
        speedoInitialised = true;
      });

      speedoDisplay.speedometerText.attr({class: "grow"})
      infoDisplay.root.attr({class: "slide-right"});
      navDisplay.root.attr({class: "slide-left"});
      var background = hu('#background', svg);
      background.attr({class: 'map-fade'})

      // gradients
      overlayGradient.stop1 = hu('#overlayStop1', svg);
      overlayGradient.stop2 = hu('#overlayStop2', svg);
      backgroundGradient.stop1 = hu('#bgStop1', svg);
      backgroundGradient.stop2 = hu('#bgStop2', svg);
      navMarkerGradient.stop1 = hu('#navStop1', svg);
      navMarkerGradient.stop2 = hu('#navStop2', svg);

      electrics.root = hu('#lights_layer', svg);
      electrics.lights.signal_L = hu("#light_signal_L", electrics.root);
      electrics.lights.signal_R = hu("#light_signal_R", electrics.root);
      electrics.lights.lights = hu("#light_lights", electrics.root);
      electrics.lights.highbeam = hu("#light_highbeam", electrics.root);
      electrics.lights.fog = hu("#light_fog", electrics.root);
      electrics.lights.lowpressure = hu("#light_lowpressure", electrics.root);
      electrics.esc = hu("#light_escActive", electrics.root);
      electrics.lights.parkingbrake = hu("#light_parkingbrake", electrics.root);
      electrics.lights.checkengine = hu("#light_checkengine", electrics.root);
      electrics.lights.lowfuel = hu("#light_battery", electrics.root);
      electrics.fuelTxt = hu("#fuel_pc", infoDisplay.root);
      electrics.fuelStops = [hu("#stop_fuel1", svg), hu("#stop_fuel2", svg)];

      if(new Date().getDate() ==1 && new Date().getMonth() == 3){
        var ellogo = hu('#imageLogo', svg);
        if(ellogo)ellogo.attr({href: "/core/art/missingTexture.png"});
      }
      setTheme(200);

      //default `Comfort` display graph and conso
      infoDisplay.accelerometer.css({opacity: 0});
      consumGraph.root.css({opacity: 1});
      consumGraph.graph_canvas.style.display = "inline";
      infoDisplay.infoValues.css({opacity: 1});
    }

    function updateGearIndicator(data) {
      // only update when gear is changed
      if (currentGear !== data.electrics.gear) {
        currentGear = data.electrics.gear;
        for (var key in speedoDisplay.gears) {
          if (key === data.electrics.gear) {
            speedoDisplay.gears[key].css({ fill: '#FFFFFF' })
          }
          else {
            speedoDisplay.gears[key].css({ fill: '#616161' })
          }
        }
      }
    }

    function updateSpeedDisplays(data) {
      if (speedoInitialised) {
        var speedAng = 226 + ((data.electrics.wheelspeed * 2.35));
        var startAngle=-227*Math.PI/180, speedRad = (data.electrics.wheelspeed*unitspeedratio)+startAngle;
        var maxRad = (275*Math.PI/180) + startAngle;
        speedRad = Math.min(speedRad, maxRad);
        //console.log("maxRad",maxRad,"rad",speedRad,"rad-start",speedRad-startAngle, "deg",(speedRad-startAngle)*180/Math.PI);
        if(Math.abs(speedRad-prevspeedAng)<0.3){return;}
        speedoDisplay.speedValue.text((data.electrics.wheelspeed * (unit=="metric"?3.6:2.23694) ).toFixed(0));
        //speedoDisplay.needle.css({transform: `rotate(${speedAng}deg)` });

        var centerX=67.4, centerY=33, radiusInt=19.5, radiusExt=21, largeArcFlag= ((speedRad-startAngle)>Math.PI)? 1 : 0;
        //console.log("startAngle",startAngle,"speedRad",speedRad,"largeArcFlag",largeArcFlag);
        var sx2 = (centerX) + Math.cos(startAngle) * radiusInt;
        var sy2 = (centerY) + Math.sin(startAngle) * radiusInt;

        var sx1 = (centerX) + Math.cos(startAngle) * radiusExt;
        var sy1 = (centerY) + Math.sin(startAngle) * radiusExt;

        var ex2 = (centerX) + Math.cos(speedRad) * radiusExt;
        var ey2 = (centerY) + Math.sin(speedRad) * radiusExt;

        var ex1 = (centerX) + Math.cos(speedRad) * radiusInt;
        var ey1 = (centerY) + Math.sin(speedRad) * radiusInt;

        var mx1 = (centerX) + Math.cos(speedRad) * 8;
        var my1 = (centerY) + Math.sin(speedRad) * 8;

        speedoDisplay.needle_bar.attr({d: "M " + sx1 + "," + sy1 +
          " A" + radiusExt  + "," + radiusExt  + " 0 "+largeArcFlag+",1 " + ex2 + "," + ey2 +
          " L " + ex1 + "," + ey1 +
          " A" + radiusInt + "," + radiusInt + " 0 "+largeArcFlag+",0 " + sx2 + "," + sy2});
        speedoDisplay.needle.attr({d: "M " + ex1 + "," + ey1 + " " +mx1+","+my1});

        for(var E in speedoDisplay.needle_gradients){
          speedoDisplay.needle_gradients[E].attr({cx:ex1,cy:ey1,fx:ex1,fy:ey1});
        }

        prevspeedAng = speedAng;
      }
    }

    function limitVal(min, val,max){
        return Math.min(Math.max(min,val), max);
    }

    function updateAccelerometer(data) {
      infoDisplay.accelerometer.css({opacity: 1})
      infoDisplay.accelerometerMarker.css({transformOrigin: '50% 50%', transform: `translate(${limitVal(-10,data.customModules.accelerationData.xSmooth,10)/1.4}px, ${-limitVal(-10,data.customModules.accelerationData.ySmooth,10)/1.4}px`})
      var roundedGX2 = (data.customModules.accelerationData.xSmooth / 10).toFixed(1);
      var roundedGY2 = (-data.customModules.accelerationData.ySmooth / 10).toFixed(1);
      infoDisplay.gXPositive.text(roundedGX2 > 0 ? roundedGX2  : 0)
      infoDisplay.gXNegative.text(roundedGX2 < 0 ? -roundedGX2 : 0)
      infoDisplay.gYNegative.text(roundedGY2 > 0 ? roundedGY2  : 0)
      infoDisplay.gYPositive.text(roundedGY2 < 0 ? -roundedGY2 : 0)
    }

    $window.redrawSpeedoTicks = (lim,bigSep,smallSep) => {
      var startAngle=-227*Math.PI/180;
      var centerX=67.4, centerY=33, radiusInt=17, radiusExt=19, radiusIntBig=16;
      var tickD = "";
      for(var ib = 0; ib<= (lim/bigSep) ; ib++){
        for(var is = 0; is<= (bigSep/smallSep); is++){
          var curAng = (ib*270/(lim/bigSep)+270*(1/(lim/bigSep))*(is/(bigSep/smallSep))) *Math.PI/180;
          if(curAng > (1.5*Math.PI)){break;}
          //console.log( (ib*270/(lim/bigSep)+270*(1/(lim/bigSep))*(is/(bigSep/smallSep))) , curAng);
          //console.log( "b=", ib*270/(lim/bigSep) , "s=", 270*(1/(lim/bigSep))*(is/(bigSep/smallSep)))
          var sx2 = (centerX) + Math.cos(startAngle+curAng) * (is===0?radiusIntBig:radiusInt);
          var sy2 = (centerY) + Math.sin(startAngle+curAng) * (is===0?radiusIntBig:radiusInt);

          var sx1 = (centerX) + Math.cos(startAngle+curAng) * radiusExt;
          var sy1 = (centerY) + Math.sin(startAngle+curAng) * radiusExt;
          tickD += "M "+(sx1)+","+(sy1)+" "+(sx2)+","+(sy2)+" ";
        }
      }
      speedoDisplay.speedTicks.attr({d: tickD});
      var testStyle = {"font-style":"normal","font-weight":"bold","font-stretch":"normal","font-family":"Arial","fill":"#ffffff","fill-opacity":1,"stroke-width":0.04861574,"text-align":"center","text-anchor":"middle"};
      speedoDisplay.speedTicksText.empty();
      for(var ib = 0; ib<=(lim/bigSep) ; ib++){
        var curAng = (ib*270/(lim/bigSep)) *Math.PI/180;
        var sx = (centerX) + Math.cos(startAngle+curAng) * 14;
        var sy = (centerY + 0.90) + Math.sin(startAngle+curAng) * 14;
        var ts = hu('<tspan>', speedoDisplay.speedTicksText)
        .attr({x: sx,y: sy})
        .text((ib*bigSep))
        .css(testStyle);
      }
    }

    // overwriting plain javascript function so we can access from within the controller
    $window.setup = (data) => {
      //console.log("setUnits", data.unit);
      unit = data.uiUnitLength;
      if( unit == "metric"){
        redrawSpeedoTicks(data.maxKPH,data.speedoMetricSepBig,data.speedoMetricSepSmall);
        unitspeedratio = 3.6/data.maxKPH*Math.PI*1.5;
        speedoDisplay.speedUnit.text("km/h");
      }
      else{
        redrawSpeedoTicks(data.maxMPH,data.speedoImperialSepBig,data.speedoImperialSepSmall);
        unitspeedratio = 2.23694/data.maxMPH*Math.PI*1.5;
        speedoDisplay.speedUnit.text("mph");
      }
    }


    $window.initMap = (data) => {
      navDimensions = data.viewParams = [
        data.terrainOffset[0],
        data.terrainOffset[1],
        data.terrainSize[0],
        data.terrainSize[1]
      ];

      $scope.$apply(() => {
        vm.mapData = data;
      });

      navContainer.style.width = data.terrainSize[0] + "px";
      navContainer.style.height = data.terrainSize[1] + "px";
    }

    $window.updateMap = (data) => {
      var focusX = -data.x;
      var focusY = data.y;
      var origin = `${((navDimensions[0] * -1)) - focusX}px ${((navDimensions[1] * -1)) - focusY}px`;
      navContainer.style.transformOrigin = origin;
      var translateX = ((((navDimensions[0])) + 512) + focusX);
      var translateY = ((((navDimensions[1])) + 256) + focusY);
      navContainer.style.transform = `translate3d(${translateX}px,${translateY}px, 0px) rotateX(${55}deg) rotateZ(${180 + (data.rotation + 360)}deg) scale(1)`;
    }

    var hue = 0;

    function appendGraphConsumption(data)  {
      var newCurrent = data.customModules.electricMotorData.averageConsumption
      if( newCurrent === undefined || newCurrent === null)
        return;
      newCurrent = newCurrent * 0.001
      var unitOffset = -300, unitY = 1200, stepPx=4;
      if( consumGraph.graph_canvas_ctx == undefined){
        console.error(consumGraph);
        return;
      }
      var colors = ["#00cc99", "#3333ff"];//consum, regen

      //var prevGraph = consumGraph.graph_canvas_ctx.createImageData(consumGraph.graph_canvas.width-stepPx, consumGraph.graph_canvas.height);
      consumGraph.graph_canvas_ctx.putImageData(consumGraph.graph_canvas_ctx.getImageData(stepPx, 0, consumGraph.graph_canvas.width-stepPx, consumGraph.graph_canvas.height), 0, 0);
      //consumGraph.graph_canvas_ctx.drawImage(consumGraph.graph_canvas, -stepPx, 0);
      consumGraph.graph_canvas_ctx.clearRect(consumGraph.graph_canvas.width-stepPx, 0, stepPx, consumGraph.graph_canvas.height);
      //consumGraph.graph_canvas_ctx.fillRect(consumGraph.graph_canvas.width-stepPx, 0, stepPx, consumGraph.graph_canvas.height);
      consumGraph.graph_canvas_ctx.strokeStyle = colors[0];
      consumGraph.graph_canvas_ctx.lineWidth = 2;
      consumGraph.graph_canvas_ctx.beginPath();
      if(consumGraph.values.current >0 && newCurrent>0){ //ALL ORANGE
        consumGraph.graph_canvas_ctx.moveTo(consumGraph.graph_canvas.width, consumGraph.graph_canvas.height-(newCurrent-unitOffset)*consumGraph.graph_canvas.height/unitY );
        consumGraph.graph_canvas_ctx.lineTo(consumGraph.graph_canvas.width-stepPx, consumGraph.graph_canvas.height-(consumGraph.values.current-unitOffset)*consumGraph.graph_canvas.height/unitY);
        consumGraph.graph_canvas_ctx.stroke();
        consumGraph.graph_canvas_ctx.beginPath();
        consumGraph.graph_canvas_ctx.moveTo(consumGraph.graph_canvas.width, consumGraph.graph_canvas.height-(newCurrent-unitOffset)*consumGraph.graph_canvas.height/unitY );
        consumGraph.graph_canvas_ctx.lineTo(consumGraph.graph_canvas.width-stepPx, consumGraph.graph_canvas.height-(consumGraph.values.current-unitOffset)*consumGraph.graph_canvas.height/unitY);
        consumGraph.graph_canvas_ctx.lineTo(consumGraph.graph_canvas.width-stepPx, consumGraph.graph_canvas.height-(0-unitOffset)*consumGraph.graph_canvas.height/unitY);
        consumGraph.graph_canvas_ctx.lineTo(consumGraph.graph_canvas.width, consumGraph.graph_canvas.height-(0-unitOffset)*consumGraph.graph_canvas.height/unitY);
        consumGraph.graph_canvas_ctx.closePath();
        consumGraph.graph_canvas_ctx.fillStyle = consumGraph.graph_canvas_gradiant_o;
        consumGraph.graph_canvas_ctx.fill();
      }
      else if(consumGraph.values.current <=0 && newCurrent<=0){ //ALL GREEN
        consumGraph.graph_canvas_ctx.strokeStyle = colors[1];
        consumGraph.graph_canvas_ctx.moveTo(consumGraph.graph_canvas.width, consumGraph.graph_canvas.height-(newCurrent-unitOffset)*consumGraph.graph_canvas.height/unitY );
        consumGraph.graph_canvas_ctx.lineTo(consumGraph.graph_canvas.width-stepPx, consumGraph.graph_canvas.height-(consumGraph.values.current-unitOffset)*consumGraph.graph_canvas.height/unitY);
        consumGraph.graph_canvas_ctx.stroke();
        consumGraph.graph_canvas_ctx.beginPath();
        consumGraph.graph_canvas_ctx.moveTo(consumGraph.graph_canvas.width, consumGraph.graph_canvas.height-(newCurrent-unitOffset)*consumGraph.graph_canvas.height/unitY );
        consumGraph.graph_canvas_ctx.lineTo(consumGraph.graph_canvas.width-stepPx, consumGraph.graph_canvas.height-(consumGraph.values.current-unitOffset)*consumGraph.graph_canvas.height/unitY);
        consumGraph.graph_canvas_ctx.lineTo(consumGraph.graph_canvas.width-stepPx, consumGraph.graph_canvas.height-(0-unitOffset)*consumGraph.graph_canvas.height/unitY);
        consumGraph.graph_canvas_ctx.lineTo(consumGraph.graph_canvas.width, consumGraph.graph_canvas.height-(0-unitOffset)*consumGraph.graph_canvas.height/unitY);
        consumGraph.graph_canvas_ctx.closePath();
        consumGraph.graph_canvas_ctx.fillStyle = consumGraph.graph_canvas_gradiant_g;
        consumGraph.graph_canvas_ctx.fill();
      }
      else{//TRANSITION
        var bp = stepPx*(consumGraph.values.current)/(consumGraph.values.current - newCurrent);
        if(consumGraph.values.current < newCurrent){ //UP
          consumGraph.graph_canvas_ctx.strokeStyle = colors[1];
          consumGraph.graph_canvas_ctx.moveTo(consumGraph.graph_canvas.width-stepPx, consumGraph.graph_canvas.height-(consumGraph.values.current-unitOffset)*consumGraph.graph_canvas.height/unitY );
          consumGraph.graph_canvas_ctx.lineTo(consumGraph.graph_canvas.width-stepPx+bp, consumGraph.graph_canvas.height-(0-unitOffset)*consumGraph.graph_canvas.height/unitY);
          consumGraph.graph_canvas_ctx.stroke();
          consumGraph.graph_canvas_ctx.beginPath();
          consumGraph.graph_canvas_ctx.moveTo(consumGraph.graph_canvas.width-stepPx, consumGraph.graph_canvas.height-(consumGraph.values.current-unitOffset)*consumGraph.graph_canvas.height/unitY );
          consumGraph.graph_canvas_ctx.lineTo(consumGraph.graph_canvas.width-stepPx+bp, consumGraph.graph_canvas.height-(0-unitOffset)*consumGraph.graph_canvas.height/unitY);
          consumGraph.graph_canvas_ctx.lineTo(consumGraph.graph_canvas.width-stepPx, consumGraph.graph_canvas.height-(0-unitOffset)*consumGraph.graph_canvas.height/unitY);
          consumGraph.graph_canvas_ctx.closePath();
          consumGraph.graph_canvas_ctx.fillStyle = consumGraph.graph_canvas_gradiant_g;
          consumGraph.graph_canvas_ctx.fill();

          consumGraph.graph_canvas_ctx.strokeStyle = colors[0];
          consumGraph.graph_canvas_ctx.beginPath();
          consumGraph.graph_canvas_ctx.moveTo(consumGraph.graph_canvas.width-stepPx+bp, consumGraph.graph_canvas.height-(0-unitOffset)*consumGraph.graph_canvas.height/unitY );
          consumGraph.graph_canvas_ctx.lineTo(consumGraph.graph_canvas.width, consumGraph.graph_canvas.height-(newCurrent-unitOffset)*consumGraph.graph_canvas.height/unitY);
          consumGraph.graph_canvas_ctx.stroke();
          consumGraph.graph_canvas_ctx.beginPath();
          consumGraph.graph_canvas_ctx.moveTo(consumGraph.graph_canvas.width-stepPx+bp, consumGraph.graph_canvas.height-(0-unitOffset)*consumGraph.graph_canvas.height/unitY );
          consumGraph.graph_canvas_ctx.lineTo(consumGraph.graph_canvas.width, consumGraph.graph_canvas.height-(newCurrent-unitOffset)*consumGraph.graph_canvas.height/unitY);
          consumGraph.graph_canvas_ctx.lineTo(consumGraph.graph_canvas.width, consumGraph.graph_canvas.height-(0-unitOffset)*consumGraph.graph_canvas.height/unitY);
          consumGraph.graph_canvas_ctx.closePath();
          consumGraph.graph_canvas_ctx.fillStyle = consumGraph.graph_canvas_gradiant_o;
          consumGraph.graph_canvas_ctx.fill();
        }
        else{ //DW
          consumGraph.graph_canvas_ctx.strokeStyle = colors[0];
          consumGraph.graph_canvas_ctx.moveTo(consumGraph.graph_canvas.width-stepPx, consumGraph.graph_canvas.height-(consumGraph.values.current-unitOffset)*consumGraph.graph_canvas.height/unitY );
          consumGraph.graph_canvas_ctx.lineTo(consumGraph.graph_canvas.width-stepPx+bp, consumGraph.graph_canvas.height-(0-unitOffset)*consumGraph.graph_canvas.height/unitY);
          consumGraph.graph_canvas_ctx.stroke();
          consumGraph.graph_canvas_ctx.beginPath();
          consumGraph.graph_canvas_ctx.moveTo(consumGraph.graph_canvas.width-stepPx, consumGraph.graph_canvas.height-(consumGraph.values.current-unitOffset)*consumGraph.graph_canvas.height/unitY );
          consumGraph.graph_canvas_ctx.lineTo(consumGraph.graph_canvas.width-stepPx+bp, consumGraph.graph_canvas.height-(0-unitOffset)*consumGraph.graph_canvas.height/unitY);
          consumGraph.graph_canvas_ctx.lineTo(consumGraph.graph_canvas.width-stepPx, consumGraph.graph_canvas.height-(0-unitOffset)*consumGraph.graph_canvas.height/unitY);
          consumGraph.graph_canvas_ctx.closePath();
          consumGraph.graph_canvas_ctx.fillStyle = consumGraph.graph_canvas_gradiant_o;
          consumGraph.graph_canvas_ctx.fill();

          consumGraph.graph_canvas_ctx.strokeStyle = colors[1];
          consumGraph.graph_canvas_ctx.beginPath();
          consumGraph.graph_canvas_ctx.moveTo(consumGraph.graph_canvas.width-stepPx+bp, consumGraph.graph_canvas.height-(0-unitOffset)*consumGraph.graph_canvas.height/unitY );
          consumGraph.graph_canvas_ctx.lineTo(consumGraph.graph_canvas.width, consumGraph.graph_canvas.height-(newCurrent-unitOffset)*consumGraph.graph_canvas.height/unitY);
          consumGraph.graph_canvas_ctx.stroke();
          consumGraph.graph_canvas_ctx.beginPath();
          consumGraph.graph_canvas_ctx.moveTo(consumGraph.graph_canvas.width-stepPx+bp, consumGraph.graph_canvas.height-(0-unitOffset)*consumGraph.graph_canvas.height/unitY );
          consumGraph.graph_canvas_ctx.lineTo(consumGraph.graph_canvas.width, consumGraph.graph_canvas.height-(newCurrent-unitOffset)*consumGraph.graph_canvas.height/unitY);
          consumGraph.graph_canvas_ctx.lineTo(consumGraph.graph_canvas.width, consumGraph.graph_canvas.height-(0-unitOffset)*consumGraph.graph_canvas.height/unitY);
          consumGraph.graph_canvas_ctx.closePath();
          consumGraph.graph_canvas_ctx.fillStyle = consumGraph.graph_canvas_gradiant_g;
          consumGraph.graph_canvas_ctx.fill();
        }
      }
      consumGraph.values.current = newCurrent;
    }

    function updateConsumption(data) {
      infoDisplay.infoValuesTxt.now.text( (data.customModules.electricMotorData.currentPower / 1.35962).toFixed(0) + " kW" ); //PS to kW

      if(data.customModules.electricMotorData.averagePower == undefined || data.customModules.electricMotorData.remainingRange == undefined){return;}
      infoDisplay.infoValuesTxt.avg.text( (data.customModules.electricMotorData.averagePower / 1.35962).toFixed(0) + " kW" ); //PS to kW
      infoDisplay.infoValuesTxt.range.text( (data.customModules.electricMotorData.remainingRange).toFixed(0) + (unit==="metric"?" km":" mi") );
    }


    function setElec(val, state, key){
      if( val === undefined || val === null){/*console.error("setElec: svg element not found", key);*/ return;}
      if( state === undefined || state === null){/*console.error("setElec: state not found", key);*/ return;}
      var cssState = (state===true || state>0.1)?"inline":"none";
      val.n.style.display = cssState;
    }

    $window.updateElectrics = (data) => {
      for(var k in electrics.lights){
        setElec(electrics.lights[k], data.electrics[k], k);
      }

      electrics.fuelTxt.text("🗲"+(data.electrics.fuel*100.0).toFixed(0) + "%")
      electrics.fuelStops[0].attr({offset: data.electrics.fuel})
      electrics.fuelStops[1].attr({offset: data.electrics.fuel+0.001})

      electrics.esc.n.style.display = (data.electrics["escActive"] || data.electrics["esc"]==1 || data.electrics["tcsActive"] || data.electrics["tcs"]==1 ) ?"inline":"none";
      if( electrics.esc.n.classList.contains("blink") !== (data.electrics["escActive"] || data.electrics["tcsActive"])){
        electrics.esc.n.classList.toggle("blink", (data.electrics["escActive"] || data.electrics["tcsActive"]));
      }
      if(data.electrics.odometer){
        let val = data.electrics.odometer
        val *= (unit=="metric")?0.001:0.0006215;
        val = Math.min(val,999999)
        infoDisplay.infoValuesTxt.odo.text( val.toFixed(0) + (unit==="metric"?" km":" mi") );
      }
    }

    $window.updateData = (data) => {
      if (data) {
        if(!ready){console.log("not ready");return;}
        // console.log(data);
        //hue = (hue+.5) % 360;
        //setTheme(hue);

        // Update PRNDS display
        updateGearIndicator(data);
        // Update Speed displays
        updateSpeedDisplays(data);

        updateConsumption(data);
        appendGraphConsumption(data);
        //updateConsumption( Math.sin( hue*8*Math.PI/45)*600+300 );

        updateElectrics(data);

        if (gForcesVisible === true) {
          updateAccelerometer(data);
        }
      }
    }

    //https://stackoverflow.com/a/56266358
    function isColor(strColor){
      var s = new Option().style;
      s.color = strColor;
      return s.color !== "";
    }

    function parseColor(strColor){
      var s = new Option().style;
      s.color = strColor;
      return s.color;
    }

    function getHue(rgb){
      let sep = rgb.indexOf(",") > -1 ? "," : " ";
      rgb = rgb.substr(4).split(")")[0].split(sep);

      for (let R in rgb) {
        let r = rgb[R];
        if (r.indexOf("%") > -1)
          rgb[R] = Math.round(r.substr(0,r.length - 1) / 100 * 255);
      }

      // Make r, g, and b fractions of 1
      let r = rgb[0] / 255,
          g = rgb[1] / 255,
          b = rgb[2] / 255;


      // Find greatest and smallest channel values
      let cmin = Math.min(r,g,b),
          cmax = Math.max(r,g,b),
          delta = cmax - cmin,
          h = 0,
          s = 0,
          l = 0;

      // Calculate hue
      // No difference
      if (delta == 0)
        h = 0;
      // Red is max
      else if (cmax == r)
        h = ((g - b) / delta) % 6;
      // Green is max
      else if (cmax == g)
        h = (b - r) / delta + 2;
      // Blue is max
      else
        h = (r - g) / delta + 4;

      h = Math.round(h * 60);

      // Make negative hues positive behind 360°
      if (h < 0)
          h += 360;
      return h;
    }

    $window.updateMode = (data) => {
      if(!ready){
        console.log("calling updateMode while svg not fully loaded");
        setTimeout(function(){ $window.updateMode(data) }, 100);
        return;
      }
      if(data === null
      || data === undefined
      || data.modeName === null
      || data.modeName === undefined
      || typeof data.modeName !== "string"
      || data.modeColor === null
      || data.modeColor === undefined
      || typeof data.modeColor !== "string"){
        console.error("updateMode receive wrong arguments :", data);
        document.getElementById("layer_wip").style.display = "inline";
        document.getElementById("tspan995").innerHTML = "MODE";
        return;
      }
      if(!isColor(data.modeColor)){
        console.error("This mode color is not in html format :",data.modeColor)
        return;
      }
      //console.log(data.modeColor);
      let h = getHue(parseColor(data.modeColor));
      setTheme(h);

      gForcesVisible = data.modeName != "Comfort";

      if (gForcesVisible === true) {
        consumGraph.root.css({opacity: 0});
        infoDisplay.infoValues.css({opacity: 0});
        consumGraph.graph_canvas.style.display = "none";
      }
      else {
        infoDisplay.accelerometer.css({opacity: 0});
        consumGraph.root.css({opacity: 1});
        consumGraph.graph_canvas.style.display = "inline";
        infoDisplay.infoValues.css({opacity: 1});
      }

    }
    ready = true;
    //$window.updateConsumption({current:0, average:0, range:0});
  });