local ReplicatedStorage = game:GetService("ReplicatedStorage")

local FIGURE = Color3.fromRGB(217, 51, 38)

local function figure(at: { number }, facing: { number }, parent: Instance)
	local look = Vector3.new(facing[1], 0, facing[2])
	local feet = Vector3.new(at[1], at[2], at[3])
	local turn = CFrame.lookAt(feet, feet + look)
	for _, box in { { 0, 1.25, 0, 1.6, 2.5, 0.8 }, { 0, 3.35, 0, 2, 1.7, 1 }, { 0, 4.6, 0, 0.8, 0.8, 0.8 } } do
		local part = Instance.new("Part")
		part.Name = "GdsFigure"
		part.Anchored = true
		part.Size = Vector3.new(box[4], box[5], box[6])
		part.CFrame = turn * CFrame.new(box[1], box[2], box[3])
		part.Color = FIGURE
		part.Material = Enum.Material.SmoothPlastic
		part.Parent = parent
	end
end

return function(Context)
	local Shared = ReplicatedStorage:WaitForChild("Shared")
	local Config = require(Shared.Features.SkyIsland.Config) :: any
	local textures = Context.textures or {}
	if Config.Grid and textures[Config.Grid.Texture] then
		Config.Grid.Texture = textures[Config.Grid.Texture]
	end
	local Build = require(Shared.Features.SkyIsland.Build) :: any
	local data = require(ReplicatedStorage.GdsPlan.Data) :: any
	local model = Instance.new("Model")
	model.Name = "GdsPlan"
	local collisions = Instance.new("Folder")
	local far = Instance.new("Model")
	far.Parent = model
	local into = { model = model, collisions = collisions, far = far }
	local shown = { visual = {}, collision = {}, solid = {} }
	local placed = 0
	for _, part in data.parts do
		if part.kind == "Collision" then
			continue
		end
		local c = part.cf
		Build.place({
			kind = part.kind,
			size = Vector3.new(part.size[1], part.size[2], part.size[3]),
			cframe = CFrame.new(c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10], c[11], c[12]),
			wedge = part.wedge == true,
			far = part.far == true,
			solid = part.solid,
			color = if part.color then Color3.new(part.color[1], part.color[2], part.color[3]) else nil,
			material = part.material,
			shape = part.form,
		}, CFrame.identity, into, shown)
		placed += 1
	end
	for _, each in data.figures or {} do
		figure(each.at, each.facing, model)
	end
	model.Parent = workspace
	print("GDS_PLACED", placed)
end
