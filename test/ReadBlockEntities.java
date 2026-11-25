import com.google.gson.*;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Transformation;
import java.nio.file.*;
import java.util.*;
import net.minecraft.SharedConstants;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.monster.shulker.ShulkerModel;
import net.minecraft.client.model.object.chest.ChestModel;
import net.minecraft.client.renderer.blockentity.ChestRenderer;
import net.minecraft.client.renderer.blockentity.ShulkerBoxRenderer;
import net.minecraft.core.*;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.*;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.RegistryDataLoader;
import net.minecraft.server.packs.*;
import net.minecraft.server.packs.repository.PackSource;
import net.minecraft.server.packs.resources.MultiPackResourceManager;
import net.minecraft.tags.TagLoader;
import java.util.concurrent.Executors;
import java.util.stream.Stream;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.level.block.EntityBlock;
import org.joml.Vector3f;

// Rebuild static preview data from the local 26.3 client without starting the game.
public class ReadBlockEntities {
 static JsonArray mesh(ModelPart root,Transformation transform,Direction lidDirection){
  var stack=new PoseStack();stack.mulPose(transform);var rows=new JsonArray();var baseRows=new JsonArray();
  root.visit(stack,(pose,path,index,cube)->{
   boolean base=path.endsWith("/bottom")||path.endsWith("/base");
   for(var poly:cube.polygons){
    if(poly==null)continue;
    var normal=pose.transformNormal(poly.normal(),new Vector3f());
    // A closed lid overlaps the body. Keep alpha cutouts, but give the lid priority
    // by insetting only the body's coplanar side faces by one model-space epsilon.
    boolean side=base&&Math.abs(normal.get(lidDirection.getAxis().ordinal()))<.001;
    var row=new JsonArray();for(float f:new float[]{normal.x,normal.y,normal.z})row.add(round(f));
    for(var v:poly.vertices()){
     var p=pose.pose().transformPosition(v.worldX(),v.worldY(),v.worldZ(),new Vector3f());
     if(side)p.fma(-1f/1024,normal);
     for(float f:new float[]{p.x,p.y,p.z,v.u(),v.v()})row.add(round(f));
    }
    (base?baseRows:rows).add(row);
   }
  });rows.addAll(baseRows);return rows;
 }
 static double round(float f){return Math.round(f*100000d)/100000d;}
 public static void main(String[] args)throws Exception{
  SharedConstants.tryDetectVersion();Bootstrap.bootStrap();
  var entities=new TreeMap<String,String>();
  for(var entry:BuiltInRegistries.BLOCK.entrySet()){
   var block=entry.getValue();if(!(block instanceof EntityBlock))continue;
   var key=entry.getKey().identifier().toString();
   var state=block.defaultBlockState();
   for(var type:BuiltInRegistries.BLOCK_ENTITY_TYPE.entrySet())if(type.getValue().isValid(state)){
    if(entities.put(key,type.getKey().identifier().toString())!=null)throw new IllegalStateException("Multiple block entity types: "+key);
   }
  }
  var models=new JsonObject();
  var chest=new JsonObject();models.add("chest",chest);
  var chestLayers=List.of(ChestModel.createSingleBodyLayer(),ChestModel.createDoubleBodyLeftLayer(),ChestModel.createDoubleBodyRightLayer());
  for(int i=0;i<chestLayers.size();i++){
   var byFacing=new JsonObject();chest.add(List.of("single","left","right").get(i),byFacing);
   for(var d:Direction.Plane.HORIZONTAL)byFacing.add(d.getSerializedName(),mesh(chestLayers.get(i).bakeRoot(),ChestRenderer.modelTransformation(d),Direction.UP));
  }
  var shulker=new JsonObject();models.add("shulker",shulker);
  for(var d:Direction.values())shulker.add(d.getSerializedName(),mesh(ShulkerModel.createBoxLayer().bakeRoot(),ShulkerBoxRenderer.modelTransform(d),d));
  var gson=new Gson();Files.writeString(Path.of(args[0]),gson.toJson(entities));Files.writeString(Path.of(args[1]),gson.toJson(models));
  if(args.length>2){
   try(var zip=FileSystems.newFileSystem(Path.of(args[3]));var executor=Executors.newFixedThreadPool(4);
       var resources=new MultiPackResourceManager(PackType.SERVER_DATA,List.of(new PathPackResources(new PackLocationInfo("vanilla",Component.literal("vanilla"),PackSource.DEFAULT,Optional.empty()),zip.getPath("/"))))) {
   var base=RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);var tags=TagLoader.loadTagsForExistingRegistries(resources,base);
   var world=RegistryDataLoader.load(resources,TagLoader.buildUpdatedLookups(base,tags),RegistryDataLoader.WORLD_REGISTRIES,executor).join();
   tags.forEach(t->t.apply());var registry=new RegistryAccess.ImmutableRegistryAccess(Stream.concat(base.registries(),world.registries()));
   BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(registry).forEach(c->c.apply());
   var document=NbtIo.read(Path.of(args[2]));var palette=document.getListOrEmpty("palette");var blocks=document.getListOrEmpty("blocks");
   for(int i=0;i<blocks.size();i++){
    var info=blocks.getCompoundOrEmpty(i);var state=NbtUtils.readBlockState(BuiltInRegistries.BLOCK,palette.getCompoundOrEmpty(info.getIntOr("state",-1)));
    var key=BuiltInRegistries.BLOCK.getKey(state.getBlock()).toString();var nbt=info.getCompoundOrEmpty("nbt");var entity=BlockEntity.loadStatic(new BlockPos(i,0,0),state,nbt,registry);
    if(entity==null||!BuiltInRegistries.BLOCK_ENTITY_TYPE.getKey(entity.getType()).toString().equals(entities.get(key)))throw new IllegalStateException("Cannot load saved block entity: "+key);
   }
   System.out.println("VANILLA_ENTITY_LOAD_OK "+blocks.size());
   }
  }
  System.out.println("BLOCK_ENTITY_MODELS_OK: "+entities.size()+" initialized block IDs, "+shulker.size()+" shulker directions");
 }
}
