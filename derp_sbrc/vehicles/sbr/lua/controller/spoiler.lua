-- This Source Code Form is subject to the terms of the bCDDL, v. 1.1.
-- If a copy of the bCDDL was not distributed with this
-- file, You can obtain one at http://beamng.com/bCDDL-1.1.txt

local M = {}
M.type = "auxilliary"
M.relevantDevice = nil

local speedThresholdNormalPosition = 23
local speedThresholdLowPosition = 12
local speedThresholdHighPosition = 8
local brakeThresholdHighPosition = 0.5

local spoilerLow = 0
local spoilerNormal = 0.58
local spoilerHigh = 1

local function updateGFX(dt)
  local spoiler = electrics.values.spoiler
  local speed = electrics.values.wheelspeed

  if electrics.values.brake > brakeThresholdHighPosition then --check for brake input
    spoiler = speed >= speedThresholdHighPosition and spoilerHigh or spoilerLow
  elseif speed >= speedThresholdNormalPosition then --we are not braking, check for normal spoiler mode speed
    spoiler = spoilerNormal --(we are above the normal spoiler position speed, so set the spoiler to normal)
  else --we are not braking AND below the normal position speed
    spoiler = (spoiler == spoilerNormal and speed >= speedThresholdLowPosition) and spoilerNormal or spoilerLow
  end

  electrics.values.spoiler = spoiler
end

local function init()
  electrics.values.spoiler = 0
end

local function setParameters(parameters)
  if parameters.spoilerLow then
    spoilerLow = parameters.spoilerLow
  end
  if parameters.spoilerNormal then
    spoilerNormal = parameters.spoilerNormal
  end
  if parameters.spoilerHigh then
    spoilerHigh = parameters.spoilerHigh
  end
end

M.init = init
M.updateGFX = updateGFX

M.setParameters = setParameters

return M
