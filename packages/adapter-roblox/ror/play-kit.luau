local ReplicatedStorage = game:GetService("ReplicatedStorage")

return function(Context)
	local presets = require(ReplicatedStorage.Shared.Presets) :: any
	local builder = require(ReplicatedStorage.Shared.Builder) :: any
	local runtime = require(ReplicatedStorage.Runtime) :: any
	local assets = table.clone(require(ReplicatedStorage.Shared.DefaultAssets) :: any)
	for _, folder in ReplicatedStorage:GetChildren() do
		if folder.Name:sub(1, 4) == "Kits" then
			for _, module in folder:GetChildren() do
				if module:IsA("ModuleScript") then
					local pack = (require(module) :: any)(presets.Library)
					presets.register(pack)
					for name, id in pack.assets or {} do
						assets[name] = id
					end
				end
			end
		end
	end
	local textures = Context.textures or {}
	for name, id in assets do
		if textures[id] then
			assets[name] = textures[id]
		end
	end
	local kit = presets.Kits[Context.kit]
	assert(kit, "no kit " .. tostring(Context.kit))
	local picks = table.clone(Context.picks or {})
	picks[Context.layer] = Context.take
	assert(kit.layers[Context.layer] and kit.layers[Context.layer][Context.take], "no take " .. Context.layer .. " " .. Context.take)
	local base = presets.ById[kit.preset]
	local id = "gds_" .. Context.kit
	local preset = table.clone(base)
	preset.id = id
	preset.layers = presets.kitLayers(kit, picks)
	presets.ById[id] = preset
	local params = builder.defaultParams(id)
	params.trigger = "Script"
	local holder = CFrame.new(Context.holder[1], Context.holder[2], Context.holder[3])
	local root = builder.create(params, {
		cframe = holder,
		size = preset.area or Vector3.one * 4,
		parent = workspace,
	}, assets)
	root:RemoveTag(builder.TAG)
	for _, item in root:GetDescendants() do
		for _, property in { "Texture", "TextureID" } do
			local ok, value = pcall(function()
				return (item :: any)[property]
			end)
			if ok and type(value) == "string" and textures[value] then
				(item :: any)[property] = textures[value]
			end
		end
	end
	local floor = Instance.new("Part")
	floor.Anchored = true
	floor.Size = Vector3.new(60, 1, 60)
	floor.Position = Vector3.new(0, -0.5, 0)
	floor.Color = Color3.fromRGB(90, 90, 90)
	floor.Parent = workspace
	runtime.PlayLocal(root, holder)
end
