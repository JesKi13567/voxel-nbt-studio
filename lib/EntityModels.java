import java.io.*;
import java.lang.reflect.*;
import java.nio.file.*;
import java.util.*;
import com.google.gson.*;
import com.mojang.serialization.Codec;
import com.mojang.serialization.JsonOps;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import net.minecraft.SharedConstants;
import net.minecraft.server.Bootstrap;
import net.minecraft.client.model.Model;
import net.minecraft.client.model.geom.EntityModelSet;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.*;
import net.minecraft.client.renderer.entity.state.*;
import net.minecraft.client.renderer.rendertype.*;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Pose;
import net.minecraft.client.renderer.texture.UvMapping;
import net.minecraft.world.item.DyeColor;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.client.resources.DefaultPlayerSkin;
import net.minecraft.client.renderer.blockentity.SkullBlockRenderer;
import net.minecraft.world.level.block.SkullBlock;
import java.util.jar.JarFile;

// Collect vanilla render submissions, without a window, renderer backend or game world.
class EntityModels {
 record ModelPart(String texture,boolean translucent,float[] vertices){}
 record Batch(String texture,boolean translucent){}
 record Export(Map<String,List<ModelPart>> models,Set<String> types,Map<String,float[]> sizes,Map<String,String> unsupported,Map<String,String> cushionTextures,Map<String,List<ModelPart>> heads,List<String> defaultSkins){}
 static final Field SETUP=field(RenderType.class,"state"),TEXTURES=field(RenderSetup.class,"textures");
 static Field field(Class<?> c,String name){try{var f=c.getDeclaredField(name);f.setAccessible(true);return f;}catch(Exception e){throw new IllegalStateException(e);}}
 static String texture(RenderType type)throws Exception{
  var bind=((Map<?,?>)TEXTURES.get(SETUP.get(type))).get("Sampler0");if(bind==null)return null;
  var id=(Identifier)field(bind.getClass(),"location").get(bind);
  var p=id.getPath();
  if(!id.getNamespace().equals("minecraft")||!p.startsWith("textures/entity/")||!p.endsWith(".png")||EntityModels.class.getResource("/assets/minecraft/"+p)==null)return null;
  return p.substring("textures/entity/".length(),p.length()-4);
 }
 static class MeshSink implements VertexConsumer {
  final ArrayList<Float> vertices;
  final float[] quad=new float[32];int count;
  static final int[] TRIANGLES={0,1,2,0,2,3};
  boolean pending;float x,y,z,u,v,ny;int color;
  MeshSink(ArrayList<Float> vertices){this.vertices=vertices;}
  @Override public void addVertex(float x,float y,float z,int color,float u,float v,int overlay,int light,float nx,float ny,float nz){
   if(pending)finish();
   int k=count*8;float shade=Math.max(.6f,.75f+.25f*ny);
   quad[k]=x;quad[k+1]=y;quad[k+2]=z;
   quad[k+3]=((color>>16)&255)/255f*shade;quad[k+4]=((color>>8)&255)/255f*shade;quad[k+5]=(color&255)/255f*shade;
   quad[k+6]=u;quad[k+7]=v;
   if(++count==4){for(int i:TRIANGLES)for(int j=0;j<8;j++)vertices.add(quad[i*8+j]);count=0;}
  }
  void finish(){if(pending){pending=false;addVertex(x,y,z,color,u,v,0,0,0,ny,0);}}
  public VertexConsumer addVertex(float x,float y,float z){finish();this.x=x;this.y=y;this.z=z;u=v=0;ny=0;color=-1;pending=true;return this;}
  public VertexConsumer setColor(int r,int g,int b,int a){return setColor(a<<24|r<<16|g<<8|b);}
  public VertexConsumer setColor(int color){this.color=color;return this;}
  public VertexConsumer setUv(float u,float v){this.u=u;this.v=v;return this;}
  public VertexConsumer setUv1(int u,int v){return this;}
  public VertexConsumer setUv2(int u,int v){return this;}
  public VertexConsumer setUv3(float u,float v){return this;}
  public VertexConsumer setNormal(float x,float y,float z){ny=y;return this;}
  public VertexConsumer setLineWidth(float width){return this;}
 }
 static class Collector implements InvocationHandler {
  final Map<Batch,ArrayList<Float>> batches=new LinkedHashMap<>();
  final SubmitNodeCollector proxy=(SubmitNodeCollector)Proxy.newProxyInstance(SubmitNodeCollector.class.getClassLoader(),new Class[]{SubmitNodeCollector.class},this);
  public Object invoke(Object self,Method method,Object[] args)throws Throwable{
   if(method.isDefault())return InvocationHandler.invokeDefault(self,method,args);
   if(method.getName().equals("order"))return self;
   if(method.getName().equals("submitModel"))add((Model<Object>)args[0],args[1],(PoseStack)args[2],(RenderType)args[3],(int)args[4],(int)args[5],(int)args[6],(UvMapping)args[7]);
   if(method.getName().equals("submitCustomGeometry")){
    var type=(RenderType)args[1];var tex=texture(type);
    if(tex!=null){var sink=new MeshSink(batches.computeIfAbsent(new Batch(tex,type.sortOnUpload()),k->new ArrayList<>()));
     ((SubmitNodeCollector.CustomGeometryRenderer)args[2]).render(((PoseStack)args[0]).last(),sink);sink.finish();}
   }
   return null;
  }
  void add(Model<Object> model,Object state,PoseStack stack,RenderType type,int light,int overlay,int tint,UvMapping mapping)throws Exception{
   var tex=texture(type);if(tex==null)return;
   model.setupAnim(state);
   var sink=new MeshSink(batches.computeIfAbsent(new Batch(tex,type.sortOnUpload()),k->new ArrayList<>()));
   model.renderToBuffer(stack,mapping==null?sink:mapping.wrap(sink),light,overlay,tint);
  }
  List<ModelPart> parts(){var out=new ArrayList<ModelPart>();for(var e:batches.entrySet()){
   if(e.getValue().isEmpty())continue;
   var data=new float[e.getValue().size()];for(int i=0;i<data.length;i++)data[i]=e.getValue().get(i);
   out.add(new ModelPart(e.getKey().texture,e.getKey().translucent,data));
  }return out;}
 }
 static final Map<String,String> DEFAULT_VARIANTS=Map.of("pig","temperate","cow","temperate","chicken","temperate","zombie_nautilus","temperate","cat","tabby","frog","temperate","wolf","pale");
 static JsonObject data(JarFile jar,String id,String variant)throws IOException {
  var e=jar.getJarEntry("data/minecraft/"+id+"_variant/"+variant+".json");
  if(e==null)return null;
  try(var reader=new InputStreamReader(jar.getInputStream(e),java.nio.charset.StandardCharsets.UTF_8)){return JsonParser.parseReader(reader).getAsJsonObject();}
 }
 static Identifier asset(JsonObject data,String key){if(!data.has(key))return null;var id=Identifier.parse(data.get(key).getAsString());return id.withPath(p->"textures/"+p+".png");}
 static void setVariant(EntityRenderState state,JsonObject json,boolean baby)throws Exception {
  if(json==null)return;
  if(state instanceof CatRenderState s){s.texture=asset(json,baby&&json.has("baby_asset_id")?"baby_asset_id":"asset_id");return;}
  if(state instanceof FrogRenderState s){s.texture=asset(json,"asset_id");return;}
  if(state instanceof WolfRenderState s){s.texture=asset(json.getAsJsonObject(baby?"baby_assets":"assets"),"wild");return;}
  var f=state.getClass().getField("variant");
  var codec=(Codec<?>)f.getType().getField("NETWORK_CODEC").get(null);
  f.set(state,codec.parse(JsonOps.INSTANCE,json).getOrThrow());
 }
 static <S extends EntityRenderState> List<ModelPart> export(EntityRenderer<?,S> renderer,net.minecraft.world.entity.EntityType<?> type,boolean baby,JsonObject variant)throws Exception{
  var state=renderer.createRenderState();state.entityType=type;state.boundingBoxWidth=type.getWidth();state.boundingBoxHeight=type.getHeight();
  if(state instanceof LivingEntityRenderState s){s.isBaby=baby;s.ageScale=baby?.5f:1;s.scale=1;s.pose=Pose.STANDING;}
  if(state instanceof AvatarRenderState s){
   s.skin=DefaultPlayerSkin.getDefaultSkin();s.showHat=s.showJacket=s.showLeftPants=s.showRightPants=s.showLeftSleeve=s.showRightSleeve=true;
  }
  if(state instanceof CushionRenderState s)s.direction=Direction.SOUTH;
  if(state instanceof BoatRenderState s)s.isUnderWater=true; // Skip the game's water-mask pass, not the hull.
  if(state instanceof ArmorStandRenderState s)s.showBasePlate=true;
  if(state instanceof SlimeRenderState s)s.size=1;
  if(state instanceof EvokerFangsRenderState s)s.biteProgress=.32f;
  setVariant(state,variant,baby);
  var collector=new Collector();
  var camera=new CameraRenderState();camera.orientation=new org.joml.Quaternionf();
  renderer.submit(state,new PoseStack(),collector.proxy,camera);return collector.parts();
 }
 public static void main(String[] args)throws Exception{
  SharedConstants.tryDetectVersion();Bootstrap.bootStrap();
  var ctx=new EntityRendererProvider.Context(null,null,null,null,null,EntityModelSet.vanilla(),null,null,null,null,null);
  var providers=(Map<net.minecraft.world.entity.EntityType<?>,EntityRendererProvider<?>>)field(EntityRenderers.class,"PROVIDERS").get(null);
  var types=new TreeSet<String>();var models=new TreeMap<String,List<ModelPart>>();var sizes=new TreeMap<String,float[]>();var unsupported=new TreeMap<String,String>();
  var cushionTextures=new TreeMap<String,String>();
  for(var e:((Map<?,?>)field(CushionRenderer.class,"TEXTURES_BY_COLOR").get(null)).entrySet()){
   var color=(DyeColor)e.getKey();var tex=((Identifier)e.getValue()).getPath();
   cushionTextures.put(color.getSerializedName(),tex.substring("textures/entity/".length(),tex.length()-4));
  }
  try(var jar=new JarFile(Path.of(SharedConstants.class.getProtectionDomain().getCodeSource().getLocation().toURI()).toFile())){
   for(var key:BuiltInRegistries.ENTITY_TYPE.keySet()){
    var type=BuiltInRegistries.ENTITY_TYPE.getValue(key);var id=key.toString();var name=key.getPath();if(type.canSummon())types.add(id);
    var size=type.getDimensions();sizes.put(id,new float[]{size.width(),size.height()});
    try{
     var provider=providers.get(type);if(provider==null){unsupported.put(id,"No default renderer");continue;}
     var renderer=provider.create(ctx);var variant=DEFAULT_VARIANTS.get(name);
     var defaults=variant==null?null:data(jar,name,variant);
     var parts=export(renderer,type,false,defaults);if(parts.isEmpty())unsupported.put(id,"No static entity texture submission");else models.put(id,parts);
     var hasBaby=renderer instanceof AgeableMobRenderer||Set.of("pig","cow","chicken","cat","wolf").contains(name);
     if(hasBaby){var young=export(renderer,type,true,defaults);if(!young.isEmpty())models.put(id+"#baby",young);}
     if(variant!=null){
      var prefix="data/minecraft/"+name+"_variant/";
      var keys=jar.stream().map(e->e.getName()).filter(n->n.startsWith(prefix)&&n.endsWith(".json")).map(n->n.substring(prefix.length(),n.length()-5)).toList();
      for(var k:keys)if(!k.equals(variant)){
       var json=data(jar,name,k);var adult=export(renderer,type,false,json);if(!adult.isEmpty())models.put(id+"#"+k,adult);
       if(hasBaby){var young=export(renderer,type,true,json);if(!young.isEmpty())models.put(id+"#"+k+"#baby",young);}
      }
     }
    }catch(Exception|LinkageError e){if(!models.containsKey(id))unsupported.put(id,e.getClass().getSimpleName()+": "+e.getMessage());}
   }
  }
  for(boolean slim:new boolean[]{false,true}){
   var renderer=new AvatarRenderer<>(ctx,slim);
   for(var id:List.of("minecraft:mannequin","minecraft:player")){
    var type=BuiltInRegistries.ENTITY_TYPE.getValue(Identifier.parse(id));
    models.put(id+(slim?"#slim":""),export(renderer,type,false,null));unsupported.remove(id);
   }
  }
  var heads=new TreeMap<String,List<ModelPart>>();
  var skull=SkullBlockRenderer.createModel(ctx.getModelSet(),SkullBlock.Types.PLAYER);
  var skin=DefaultPlayerSkin.getDefaultTexture();
  for(int i=0;i<16;i++){
   var stack=new PoseStack();stack.mulPose(SkullBlockRenderer.TRANSFORMATIONS.freeTransformations(i).getMatrix());
   var collector=new Collector();SkullBlockRenderer.submitSkull(0,stack,collector.proxy,0,skull,SkullBlockRenderer.getPlayerSkinRenderTypeCutout(skin),0,null);
   heads.put(Integer.toString(i),collector.parts());
  }
  for(var facing:Direction.Plane.HORIZONTAL){
   var stack=new PoseStack();stack.mulPose(SkullBlockRenderer.TRANSFORMATIONS.wallTransformation(facing).getMatrix());
   var collector=new Collector();SkullBlockRenderer.submitSkull(0,stack,collector.proxy,0,skull,SkullBlockRenderer.getPlayerSkinRenderTypeCutout(skin),0,null);
   heads.put(facing.getSerializedName(),collector.parts());
  }
  var defaultSkins=new ArrayList<String>();for(int i=0;i<18;i++)defaultSkins.add(DefaultPlayerSkin.get(new UUID(0,i)).body().texturePath().getPath());
  Files.writeString(Path.of(args[0]),new Gson().toJson(new Export(models,types,sizes,unsupported,cushionTextures,heads,defaultSkins)));
 }
}
