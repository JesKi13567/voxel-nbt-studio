import com.google.gson.*;
import com.mojang.serialization.JsonOps;
import java.lang.reflect.*;
import java.nio.file.*;
import java.util.*;
import net.minecraft.SharedConstants;
import net.minecraft.server.Bootstrap;
import net.minecraft.core.*;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.*;
import net.minecraft.resources.RegistryOps;
import net.minecraft.server.packs.*;
import net.minecraft.server.packs.repository.PackSource;
import net.minecraft.server.packs.resources.MultiPackResourceManager;
import net.minecraft.tags.TagLoader;
import net.minecraft.util.datafix.*;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.blockpredicates.BlockPredicate;

public class MaskOracle {
 static BlockPos pos(JsonElement v) {
  var arr=v.getAsJsonArray();return new BlockPos(arr.get(0).getAsInt(),arr.get(1).getAsInt(),arr.get(2).getAsInt());
 }
 static CompoundTag nbt(JsonObject row,String key,String props) {
  var state=new CompoundTag();state.putString(key,row.get("name").getAsString());
  var p=new CompoundTag();for(var e:row.getAsJsonObject("props").entrySet())p.putString(e.getKey(),e.getValue().getAsString());
  if(!p.isEmpty())state.put(props,p);return state;
 }
 static CompoundTag nativeState(JsonObject row,int version) {
  if(version>=SharedConstants.getCurrentVersion().dataVersion().version())return nbt(row,"id","properties");
  var root=new CompoundTag();var palette=new ListTag();palette.add(nbt(row,"Name","Properties"));root.put("palette",palette);
  return DataFixTypes.STRUCTURE.updateToCurrentVersion(DataFixers.getDataFixer(),root,version).getListOrEmpty("palette").getCompoundOrEmpty(0);
 }
 public static void main(String[] args)throws Exception {
  SharedConstants.tryDetectVersion();Bootstrap.bootStrap();
  try(var zip=FileSystems.newFileSystem(Path.of(args[0]));
   var resources=new MultiPackResourceManager(PackType.SERVER_DATA,List.of(new PathPackResources(new PackLocationInfo("vanilla",net.minecraft.network.chat.Component.literal("vanilla"),PackSource.DEFAULT,Optional.empty()),zip.getPath("/"))))) {
   var access=RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
   TagLoader.loadTagsForExistingRegistries(resources,access).forEach(t->t.apply());
   var ops=RegistryOps.create(JsonOps.INSTANCE,access);
   var fixture=JsonParser.parseString(Files.readString(Path.of(args[1]))).getAsJsonObject();
   int height=fixture.get("height").getAsInt();var cells=new HashMap<BlockPos,BlockState>();
   for(var v:fixture.getAsJsonArray("cells")){
    var row=v.getAsJsonObject();int dv=row.has("dv")?row.get("dv").getAsInt():Integer.MAX_VALUE;
    cells.put(pos(row.get("pos")),NbtUtils.readBlockState(BuiltInRegistries.BLOCK,nativeState(row,dv)));
   }
   var air=Blocks.AIR.defaultBlockState();
   LevelAccessor level=(LevelAccessor)Proxy.newProxyInstance(MaskOracle.class.getClassLoader(),new Class<?>[]{LevelAccessor.class},(obj,m,a)->switch(m.getName()){
    case "getBlockState" -> cells.getOrDefault(a[0],air);
    case "getFluidState" -> cells.getOrDefault(a[0],air).getFluidState();
    case "getBlockEntity" -> null;
   case "getMinY", "getSeaLevel" -> 0;
    case "getHeight" -> height;
    default -> {if(m.isDefault())yield InvocationHandler.invokeDefault(obj,m,a);throw new UnsupportedOperationException(m.toString());}
   });
   var out=new JsonArray();
   for(var v:fixture.getAsJsonArray("queries")){
    var row=v.getAsJsonObject();var result=BlockPredicate.CODEC.parse(ops,row.get("rule"));
    if(result.result().isEmpty())out.add(result.error().orElseThrow().message());
    else{var answers=new JsonArray();var rule=result.getOrThrow();for(var p:row.getAsJsonArray("positions"))answers.add(rule.test(level,pos(p)));out.add(answers);}
   }
   Files.writeString(Path.of(args[2]),out.toString());
  }
 }
}
